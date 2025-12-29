from flask import Flask, render_template, jsonify, request
import pandas as pd
import ast
import re
import pickle
import os
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics.pairwise import cosine_similarity

# Constants
MODEL_FILE = 'model.pkl'
SIMILARITY_THRESHOLD = 0.15
MIN_COMMON_TAGS = 2
MAX_RECOMMENDATIONS = 5
COMPANY_MAP = {
    'MarvelStudios': 'Marvel', 'MarvelEnterprises': 'Marvel',
    'DCComics': 'DC', 'DCEntertainment': 'DC',
    'WarnerBros.Pictures': 'WarnerBros', 'WarnerBros.': 'WarnerBros'
}

# Precompiled regex
CLEAN_REGEX = re.compile(r'[^\w\s]')
NORM_REGEX = re.compile(r'[-:\s]')

app = Flask(__name__)


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
    words = CLEAN_REGEX.sub('', text.lower()).split()
    return [w for w in words if w not in ENGLISH_STOP_WORDS and len(w) >= 4]


def normalize_title(title):
    return NORM_REGEX.sub('', title.lower())


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
    df['title_norm'] = df['title'].apply(normalize_title)

    print("Training model...")
    vectors = CountVectorizer(max_features=5000, stop_words='english').fit_transform(df['tags']).toarray()
    similarity = cosine_similarity(vectors)

    print("Saving model...")
    with open(MODEL_FILE, 'wb') as f:
        pickle.dump({'df': df, 'sim': similarity}, f)
    return df, similarity


def load_model():
    if os.path.exists(MODEL_FILE):
        print("Loading saved model...")
        with open(MODEL_FILE, 'rb') as f:
            data = pickle.load(f)
        return data['df'], data['sim']
    return train_model()


# Load model on startup
df, sim = load_model()
movie_titles = df['title'].tolist()  # Cache for autocomplete


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/api/movies')
def get_movies():
    return jsonify(movie_titles)


@app.route('/api/recommend')
def recommend():
    movie = request.args.get('movie', '')
    norm = normalize_title(movie)
    matches = df[df['title_norm'] == norm]

    if matches.empty:
        similar = df[df['title_norm'].str.contains(norm, regex=False)]
        suggestions = similar['title'].head(5).tolist() if not similar.empty else []
        return jsonify({'error': 'not_found', 'suggestions': suggestions})

    idx = matches.index[0]
    input_tags = set(df.loc[idx, 'tags'].split())
    top_candidates = sim[idx].argsort()[-11:-1][::-1]

    recommendations = []
    for i in top_candidates:
        score = sim[idx][i]
        if score < SIMILARITY_THRESHOLD:
            continue

        common = [t for t in (input_tags & set(df.iloc[i]['tags'].split())) if len(t) > 3][:4]
        if len(common) < MIN_COMMON_TAGS:
            continue

        recommendations.append({
            'title': df.iloc[i]['title'],
            'reasons': common,
            'match': round(score * 100)
        })

        if len(recommendations) >= MAX_RECOMMENDATIONS:
            break

    return jsonify({'movie': df.loc[idx, 'title'], 'recommendations': recommendations})


if __name__ == '__main__':
    app.run(debug=True)
