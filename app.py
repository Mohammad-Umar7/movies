from flask import Flask, render_template, jsonify, request
import pandas as pd
import ast
import re
import pickle
import os
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

MODEL_FILE = 'model.pkl'
COMPANY_MAP = {
    'MarvelStudios': 'Marvel', 'MarvelEnterprises': 'Marvel',
    'DCComics': 'DC', 'DCEntertainment': 'DC',
    'WarnerBros.Pictures': 'WarnerBros', 'WarnerBros.': 'WarnerBros'
}

def extract_names(obj, limit=None, job=None):
    try:
        data = ast.literal_eval(obj)
        if job:
            return [i['name'].replace(" ", "") for i in data if i.get('job') == job][:1]
        names = [i['name'].replace(" ", "") for i in data]
        return names[:limit] if limit else names
    except:
        return []

def clean_text(text):
    words = re.sub(r'[^\w\s]', '', text.lower()).split()
    return [w for w in words if w not in ENGLISH_STOP_WORDS and len(w) >= 4]

def train_model():
    print("Loading data...")
    movies = pd.read_csv('tmdb_5000_movies.csv').merge(
        pd.read_csv('tmdb_5000_credits.csv'), on='title'
    )[['movie_id', 'title', 'overview', 'genres', 'keywords', 'cast', 'crew', 'production_companies']].dropna()

    print("Cleaning data...")
    movies['genres'] = movies['genres'].apply(extract_names)
    movies['keywords'] = movies['keywords'].apply(extract_names)
    movies['cast'] = movies['cast'].apply(lambda x: extract_names(x, limit=5))
    movies['crew'] = movies['crew'].apply(lambda x: extract_names(x, job='Director'))
    movies['production_companies'] = movies['production_companies'].apply(
        lambda x: [COMPANY_MAP.get(c, c) for c in extract_names(x)])
    movies['overview'] = movies['overview'].apply(clean_text)

    movies['tags'] = (movies['overview'] + movies['genres']*3 + movies['keywords']*2 +
                      movies['cast']*3 + movies['crew']*2 + movies['production_companies']*3)

    df = movies[['movie_id', 'title', 'tags']].copy()
    df['tags'] = df['tags'].apply(lambda x: " ".join(x).lower())
    df['title_norm'] = df['title'].str.lower().str.replace(r'[-:\s]', '', regex=True)

    print("Training model...")
    vectors = CountVectorizer(max_features=5000, stop_words='english').fit_transform(df['tags']).toarray()
    sim = cosine_similarity(vectors)

    print("Saving model...")
    with open(MODEL_FILE, 'wb') as f:
        pickle.dump({'df': df, 'sim': sim}, f)
    return df, sim

def load_model():
    if os.path.exists(MODEL_FILE):
        print("Loading saved model...")
        with open(MODEL_FILE, 'rb') as f:
            data = pickle.load(f)
        return data['df'], data['sim']
    return train_model()

# Load model on startup
df, sim = load_model()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/movies')
def get_movies():
    """Return all movie titles for autocomplete"""
    return jsonify(df['title'].tolist())

@app.route('/api/recommend')
def recommend():
    """Get recommendations for a movie"""
    movie = request.args.get('movie', '')
    norm = movie.lower().replace("-", "").replace(" ", "").replace(":", "")
    matches = df[df['title_norm'] == norm]

    if matches.empty:
        # Try partial match
        similar = df[df['title_norm'].str.contains(norm, regex=False)]
        if not similar.empty:
            suggestions = similar['title'].head(5).tolist()
            return jsonify({'error': 'not_found', 'suggestions': suggestions})
        return jsonify({'error': 'not_found', 'suggestions': []})

    idx = matches.index[0]
    input_tags = set(df.loc[idx, 'tags'].split())

    # Get top 10 candidates, then filter by threshold
    SIMILARITY_THRESHOLD = 0.15  # Minimum 15% match
    top_candidates = sim[idx].argsort()[-11:-1][::-1]  # Get more candidates to filter

    MIN_COMMON_TAGS = 2  # Require at least 2 explainable reasons

    recommendations = []
    for i in top_candidates:
        score = sim[idx][i]
        if score < SIMILARITY_THRESHOLD:
            continue
        common = [t for t in (input_tags & set(df.iloc[i]['tags'].split())) if len(t) > 3][:4]
        if len(common) < MIN_COMMON_TAGS:
            continue  # Skip if not enough explainable reasons
        recommendations.append({
            'title': df.iloc[i]['title'],
            'reasons': common,
            'match': round(score * 100)  # Convert to percentage
        })
        if len(recommendations) >= 5:  # Limit to 5 results
            break

    return jsonify({
        'movie': df.loc[idx, 'title'],
        'recommendations': recommendations
    })

if __name__ == '__main__':
    app.run(debug=True)
