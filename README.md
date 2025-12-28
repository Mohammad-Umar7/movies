# Movie Recommendation System

A content-based movie recommendation system that suggests similar movies based on genres, cast, crew, keywords, and plot descriptions.

## Features

- Interactive command-line interface with autocomplete
- Recommends 5 similar movies for any search
- Shows common tags explaining why each movie was recommended
- Uses cosine similarity on movie metadata

## Requirements

- Python 3.7+
- Required packages: `pandas`, `scikit-learn`, `questionary`

## Installation

```bash
pip install -r requirements.txt
```

## Data Files

Download the TMDB 5000 dataset and place these files in the project folder:
- `tmdb_5000_movies.csv`
- `tmdb_5000_credits.csv`

Dataset available at: [Kaggle TMDB 5000 Movie Dataset](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata)

## Usage

```bash
python main.py
```

Then start typing a movie name. Use arrow keys to select from suggestions and press Enter.

### Example

```
? Enter movie name: Spider-Man 3

--- Recommendations for 'Spider-Man 3' ---
Spider-Man 2  (tobeymaguire, samraimi, fantasy, parker)
Spider-Man  (jamesfranco, marvel, action, tobeymaguire)
The Amazing Spider-Man 2  (superpowers, marvel, action, fantasy)
The Amazing Spider-Man  (superpowers, alter, action, fantasy)
Thor: The Dark World  (marvel, action, fantasy, adventure)
```

The tags in parentheses show what the recommended movie has in common with your search.

## How It Works

1. **Data Loading** - Merges movie metadata with cast/crew information
2. **Feature Extraction** - Extracts genres, keywords, top 5 actors, director, and production companies
3. **Tag Creation** - Combines all features into a single tag string per movie (with boosting for important features)
4. **Vectorization** - Converts tags to numerical vectors using CountVectorizer
5. **Similarity Calculation** - Uses cosine similarity to find movies with similar tag profiles
6. **Recommendation** - Returns top 5 most similar movies (excluding the search movie itself)

## Feature Weights

The system boosts certain features by repeating them in the tag string:
- Cast: 3x
- Genres: 3x
- Production Companies: 3x
- Keywords: 2x
- Director: 2x
- Overview: 1x

This means actor and genre matches are weighted more heavily than plot keywords.
