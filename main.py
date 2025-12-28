import pandas as pd
import ast
import re
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics.pairwise import cosine_similarity
import questionary

# --- 1. LOAD & MERGE DATA ---
print("Loading data...")
movies = pd.read_csv('tmdb_5000_movies.csv')
credits = pd.read_csv('tmdb_5000_credits.csv')

movies = movies.merge(credits, on='title')[['movie_id', 'title', 'overview', 'genres', 'keywords', 'cast', 'crew', 'production_companies']]
movies.dropna(inplace=True)

# --- 2. DATA CLEANING FUNCTIONS ---
def extract_names(text_obj, limit=None, job_filter=None):
    """Extract names from JSON string. Optionally limit count or filter by job."""
    try:
        data = ast.literal_eval(text_obj)
        if job_filter:
            return [i['name'].replace(" ", "") for i in data if i.get('job') == job_filter][:1]
        names = [i['name'].replace(" ", "") for i in data]
        return names[:limit] if limit else names
    except:
        return []

# --- 3. APPLY CLEANING ---
print("Cleaning data...")

movies['genres'] = movies['genres'].apply(extract_names)
movies['keywords'] = movies['keywords'].apply(extract_names)
movies['cast'] = movies['cast'].apply(lambda x: extract_names(x, limit=5))
movies['crew'] = movies['crew'].apply(lambda x: extract_names(x, job_filter='Director'))
def normalize_companies(companies):
    """Normalize production company names (e.g., Marvel Studios -> Marvel)"""
    mapping = {
        'MarvelStudios': 'Marvel',
        'MarvelEnterprises': 'Marvel',
        'DCComics': 'DC',
        'DCEntertainment': 'DC',
        'WarnerBros.Pictures': 'WarnerBros',
        'WarnerBros.': 'WarnerBros',
    }
    return [mapping.get(c, c) for c in companies]

movies['production_companies'] = movies['production_companies'].apply(extract_names).apply(normalize_companies)

def clean_overview(text):
    """Clean overview text: remove punctuation, stop words, and short words."""
    # Remove punctuation and convert to lowercase
    text = re.sub(r'[^\w\s]', '', text.lower())
    words = text.split()
    # Filter out stop words and words shorter than 4 characters
    return [w for w in words if w not in ENGLISH_STOP_WORDS and len(w) >= 4]

movies['overview'] = movies['overview'].apply(clean_overview)

# Create tags and final dataframe (boost important features by repeating 3x)
movies['tags'] = (
    movies['overview'] +
    movies['genres'] * 3 +
    movies['keywords'] * 2 +
    movies['cast'] * 3 +
    movies['crew'] * 2 +
    movies['production_companies'] * 3
)
new_df = movies[['movie_id', 'title', 'tags']].copy()
new_df['tags'] = new_df['tags'].apply(lambda x: " ".join(x).lower())

# Pre-compute normalized titles for fast searching (remove spaces, hyphens, colons)
new_df['title_normalized'] = new_df['title'].str.lower().str.replace("-", "", regex=False).str.replace(" ", "", regex=False).str.replace(":", "", regex=False)

# --- 4. VECTORIZATION & MODELING ---
print("Training model...")

cv = CountVectorizer(max_features=5000, stop_words='english')
vectors = cv.fit_transform(new_df['tags']).toarray()
similarity = cosine_similarity(vectors)

# --- 5. RECOMMENDATION FUNCTION ---
def normalize(text):
    return text.lower().replace("-", "").replace(" ", "").replace(":", "")

def recommend(movie):
    movie_normalized = normalize(movie)
    matches = new_df[new_df['title_normalized'] == movie_normalized]

    if matches.empty:
        similar = new_df[new_df['title_normalized'].str.contains(movie_normalized, regex=False)]
        if not similar.empty:
            print(f"\nMovie '{movie}' not found. Did you mean:")
            for title in similar['title'].head(5).values:
                print(f"  - {title}")
        else:
            print(f"\nError: Movie '{movie}' not found in the database.")
        return

    movie_index = matches.index[0]
    distances = similarity[movie_index]
    top_indices = distances.argsort()[-6:-1][::-1]  # Top 5 excluding itself

    # Get input movie's tags as a set
    input_tags = set(new_df.loc[movie_index, 'tags'].split())

    print(f"\n--- Recommendations for '{new_df.loc[movie_index, 'title']}' ---")
    for idx in top_indices:
        rec_tags = set(new_df.iloc[idx]['tags'].split())
        common = input_tags & rec_tags  # Intersection
        # Show top 4 common tags (skip very short words)
        common_display = [t for t in common if len(t) > 3][:4]
        print(f"{new_df.iloc[idx]['title']}  ({', '.join(common_display)})")

# --- 6. INTERACTIVE LOOP ---
print("System Ready!")
print("Type to search, arrow keys to select, Enter to confirm, Ctrl+C to quit.\n")

# Get all movie titles for autocomplete
all_titles = new_df['title'].tolist()

while True:
    try:
        movie_name = questionary.autocomplete(
            "Enter movie name:",
            choices=all_titles,
            match_middle=True,
        ).ask()

        if movie_name is None or movie_name.lower() == 'quit':
            print("Goodbye!")
            break

        recommend(movie_name)
        print()

    except KeyboardInterrupt:
        print("\nGoodbye!")
        break
