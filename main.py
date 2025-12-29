import pandas as pd, ast, re, pickle, os, questionary
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics.pairwise import cosine_similarity

MODEL_FILE = 'model.pkl'
COMPANY_MAP = {'MarvelStudios': 'Marvel', 'MarvelEnterprises': 'Marvel', 'DCComics': 'DC',
               'DCEntertainment': 'DC', 'WarnerBros.Pictures': 'WarnerBros', 'WarnerBros.': 'WarnerBros'}

def extract_names(obj, limit=None, job=None):
    try:
        data = ast.literal_eval(obj)
        if job: return [i['name'].replace(" ", "") for i in data if i.get('job') == job][:1]
        names = [i['name'].replace(" ", "") for i in data]
        return names[:limit] if limit else names
    except: return []

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
    with open(MODEL_FILE, 'wb') as f: pickle.dump({'df': df, 'sim': sim}, f)
    return df, sim

def load_model():
    if os.path.exists(MODEL_FILE):
        print("Loading saved model...")
        with open(MODEL_FILE, 'rb') as f: data = pickle.load(f)
        return data['df'], data['sim']
    return train_model()

df, sim = load_model()

def recommend(movie):
    norm = movie.lower().replace("-", "").replace(" ", "").replace(":", "")
    matches = df[df['title_norm'] == norm]

    if matches.empty:
        similar = df[df['title_norm'].str.contains(norm, regex=False)]
        if not similar.empty:
            print(f"\nMovie '{movie}' not found. Did you mean:")
            for t in similar['title'].head(5).values: print(f"  - {t}")
        else:
            print(f"\nError: Movie '{movie}' not found.")
        return

    idx = matches.index[0]
    top = sim[idx].argsort()[-6:-1][::-1]
    input_tags = set(df.loc[idx, 'tags'].split())

    print(f"\n--- Recommendations for '{df.loc[idx, 'title']}' ---")
    for i in top:
        common = [t for t in (input_tags & set(df.iloc[i]['tags'].split())) if len(t) > 3][:4]
        print(f"{df.iloc[i]['title']}  ({', '.join(common)})")

print("System Ready!\nType to search, arrow keys to select, Enter to confirm, Ctrl+C to quit.\n")

while True:
    try:
        name = questionary.autocomplete("Enter movie name:", choices=df['title'].tolist(), match_middle=True).ask()
        if name is None or name.lower() == 'quit': break
        recommend(name)
        print()
    except KeyboardInterrupt:
        break
print("Goodbye!")
