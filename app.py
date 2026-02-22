import os
import re
import ast
import logging

import pandas as pd
import joblib
import requests
from flask import Flask, render_template, jsonify, request
from dotenv import load_dotenv
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics.pairwise import cosine_similarity
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Load environment variables (explicit path so Flask reloader doesn't lose it)
_basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_basedir, '.env'))

# Logging
logging.basicConfig(
    level=logging.DEBUG if os.getenv('FLASK_DEBUG', 'false').lower() == 'true' else logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

# Config from .env
TMDB_API_KEY = os.getenv('TMDB_API_KEY', '')
OMDB_API_KEY = os.getenv('OMDB_API_KEY', '')
FLASK_PORT = int(os.getenv('FLASK_PORT', 5000))
FLASK_DEBUG = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
MODEL_FILE = os.getenv('MODEL_FILE', 'model.joblib')
SIMILARITY_THRESHOLD = float(os.getenv('SIMILARITY_THRESHOLD', 0.15))
MIN_COMMON_TAGS = int(os.getenv('MIN_COMMON_TAGS', 2))
MAX_RECOMMENDATIONS = int(os.getenv('MAX_RECOMMENDATIONS', 5))

TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'
COMPANY_MAP = {
    'MarvelStudios': 'Marvel', 'MarvelEnterprises': 'Marvel',
    'DCComics': 'DC', 'DCEntertainment': 'DC',
    'WarnerBros.Pictures': 'WarnerBros', 'WarnerBros.': 'WarnerBros'
}

# Precompiled regex
CLEAN_REGEX = re.compile(r'[^\w\s]')
NORM_REGEX = re.compile(r'[-:\s]')

app = Flask(__name__)

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)


def extract_names(obj, limit=None, job=None):
    try:
        data = ast.literal_eval(obj)
        if job:
            return [i['name'].replace(" ", "") for i in data if i.get('job') == job][:1]
        names = [i['name'].replace(" ", "") for i in data]
        return names[:limit] if limit else names
    except Exception:
        return []


def clean_text(text):
    words = CLEAN_REGEX.sub('', text.lower()).split()
    return [w for w in words if w not in ENGLISH_STOP_WORDS and len(w) >= 4]


def normalize_title(title):
    return NORM_REGEX.sub('', title.lower())


def train_model():
    logger.info("Loading data...")
    movies = pd.read_csv('tmdb_5000_movies.csv').merge(
        pd.read_csv('tmdb_5000_credits.csv'), on='title'
    )[['movie_id', 'title', 'overview', 'genres', 'keywords', 'cast', 'crew',
       'production_companies', 'release_date', 'vote_average']].dropna(subset=['title', 'overview'])

    logger.info("Cleaning data...")
    movies['genres'] = movies['genres'].apply(extract_names)
    movies['keywords'] = movies['keywords'].apply(extract_names)
    movies['cast'] = movies['cast'].apply(lambda x: extract_names(x, limit=5))
    movies['crew'] = movies['crew'].apply(lambda x: extract_names(x, job='Director'))
    movies['production_companies'] = movies['production_companies'].apply(
        lambda x: [COMPANY_MAP.get(c, c) for c in extract_names(x)])

    # Preserve raw overview for API responses
    movies['overview_raw'] = movies['overview']
    movies['overview'] = movies['overview'].apply(clean_text)

    movies['tags'] = (movies['overview'] + movies['genres'] * 3 + movies['keywords'] * 2 +
                      movies['cast'] * 3 + movies['crew'] * 2 + movies['production_companies'] * 3)

    df = movies[['movie_id', 'title', 'tags', 'genres', 'overview_raw',
                 'release_date', 'vote_average']].copy()
    df['tags'] = df['tags'].apply(lambda x: " ".join(x).lower())
    df['title_norm'] = df['title'].apply(normalize_title)

    logger.info("Training model...")
    vectors = CountVectorizer(max_features=5000, stop_words='english').fit_transform(df['tags']).toarray()
    similarity = cosine_similarity(vectors)

    logger.info("Saving model...")
    joblib.dump({'df': df, 'sim': similarity}, MODEL_FILE)
    return df, similarity


def load_model():
    if os.path.exists(MODEL_FILE):
        logger.info("Loading saved model...")
        data = joblib.load(MODEL_FILE)
        return data['df'], data['sim']
    return train_model()


# Load model on startup
df, sim = load_model()
movie_titles = df['title'].tolist()


def fetch_poster_info(movie_id, title):
    """Fetch movie poster. Tries TMDB first, falls back to OMDb."""
    # Try TMDB
    if TMDB_API_KEY and TMDB_API_KEY != 'your_tmdb_api_key_here':
        try:
            url = f'https://api.themoviedb.org/3/movie/{movie_id}'
            resp = requests.get(url, params={'api_key': TMDB_API_KEY}, timeout=5)
            resp.raise_for_status()
            data = resp.json()
            return {
                'poster_url': f"{TMDB_IMAGE_BASE}{data['poster_path']}" if data.get('poster_path') else None,
                'source': 'tmdb'
            }
        except Exception as e:
            logger.error(f"TMDB API error for movie {movie_id}: {e}")

    # Try OMDb (searches by title)
    if OMDB_API_KEY and OMDB_API_KEY != 'your_omdb_api_key_here':
        try:
            resp = requests.get('http://www.omdbapi.com/', params={
                'apikey': OMDB_API_KEY, 't': title
            }, timeout=5)
            resp.raise_for_status()
            data = resp.json()
            if data.get('Response') == 'True' and data.get('Poster', 'N/A') != 'N/A':
                return {
                    'poster_url': data['Poster'],
                    'source': 'omdb'
                }
        except Exception as e:
            logger.error(f"OMDb API error for '{title}': {e}")

    return None


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/api/movies')
def get_movies():
    return jsonify(movie_titles)


@app.route('/api/recommend')
@limiter.limit("30 per minute")
def recommend():
    movie = request.args.get('movie', '').strip()

    if not movie:
        return jsonify({'error': 'missing_param', 'message': 'Movie title is required'}), 400
    if len(movie) > 200:
        return jsonify({'error': 'invalid_input', 'message': 'Movie title too long'}), 400

    norm = normalize_title(movie)
    matches = df[df['title_norm'] == norm]

    if matches.empty:
        similar = df[df['title_norm'].str.contains(norm, regex=False)]
        suggestions = similar['title'].head(5).tolist() if not similar.empty else []
        return jsonify({'error': 'not_found', 'suggestions': suggestions})

    idx = matches.index[0]
    input_tags = set(df.loc[idx, 'tags'].split())
    top_candidates = sim[idx].argsort()[-11:-1][::-1]

    # Build genre set for categorizing reasons
    movie_genres = df.loc[idx, 'genres']
    genres_set = set(g.lower().replace(' ', '') for g in movie_genres) if isinstance(movie_genres, list) else set()

    recommendations = []
    for i in top_candidates:
        score = sim[idx][i]
        if score < SIMILARITY_THRESHOLD:
            continue

        common = [t for t in (input_tags & set(df.iloc[i]['tags'].split())) if len(t) > 3][:4]
        if len(common) < MIN_COMMON_TAGS:
            continue

        # Categorize reasons as genre or keyword
        categorized_reasons = []
        for tag in common:
            tag_type = 'genre' if tag in genres_set else 'keyword'
            categorized_reasons.append({'tag': tag, 'type': tag_type})

        row = df.iloc[i]
        recommendations.append({
            'title': row['title'],
            'movie_id': int(row['movie_id']),
            'reasons': categorized_reasons,
            'match': round(score * 100),
            'year': str(row['release_date'])[:4] if pd.notna(row['release_date']) else None,
            'rating': round(float(row['vote_average']), 1) if pd.notna(row['vote_average']) else None,
            'genres': row['genres'] if isinstance(row['genres'], list) else [],
            'overview': str(row['overview_raw'])[:300] if pd.notna(row['overview_raw']) else None,
        })

        if len(recommendations) >= MAX_RECOMMENDATIONS:
            break

    if not recommendations:
        weak_matches = [i for i in top_candidates if sim[idx][i] >= SIMILARITY_THRESHOLD]
        if not weak_matches:
            reason = 'low_similarity'
            message = 'This movie has a very unique profile. No similar movies found.'
        else:
            reason = 'no_common_tags'
            message = 'Similar movies exist but share too few distinguishing features.'
        return jsonify({
            'movie': df.loc[idx, 'title'],
            'movie_id': int(df.loc[idx, 'movie_id']),
            'recommendations': [],
            'empty_reason': reason,
            'empty_message': message
        })

    return jsonify({
        'movie': df.loc[idx, 'title'],
        'movie_id': int(df.loc[idx, 'movie_id']),
        'recommendations': recommendations
    })


@app.route('/api/movie-info')
@limiter.limit("60 per minute")
def movie_info():
    """Fetch movie poster from TMDB or OMDb."""
    movie_id = request.args.get('id', '')
    title = request.args.get('title', '')
    if not movie_id or not movie_id.isdigit():
        return jsonify({'error': 'invalid_id'}), 400

    info = fetch_poster_info(int(movie_id), title)
    if info is None:
        return jsonify({'error': 'api_unavailable'}), 503

    return jsonify(info)


if __name__ == '__main__':
    app.run(debug=FLASK_DEBUG, port=FLASK_PORT)
