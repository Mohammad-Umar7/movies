# Movie Recommendation System

A content-based movie recommendation web app with a Netflix-style UI. Suggests similar movies based on genres, cast, crew, keywords, and plot descriptions, complete with poster images from TMDB.

## Features

- Netflix-style dark UI with responsive design
- Autocomplete search with keyboard navigation (debounced)
- Movie poster images via TMDB API
- Rich recommendation cards: year, rating, genre badges, overview
- Categorized "why this match" tags (genre vs keyword)
- Favorites system with localStorage persistence
- Cosine similarity ML model with configurable thresholds
- Input validation and rate limiting
- Full accessibility (ARIA labels, keyboard navigation)
- Docker support

## Requirements

- Python 3.9+
- A [TMDB API key](https://www.themoviedb.org/settings/api) (free, for poster images)

## Installation

```bash
pip install -r requirements.txt
```

## Setup

1. Copy the example environment file and add your TMDB API key:

```bash
cp .env.example .env
```

2. Edit `.env` and set your TMDB API key:

```
TMDB_API_KEY=your_actual_key_here
```

3. Download the TMDB 5000 dataset and place these files in the project folder:
   - `tmdb_5000_movies.csv`
   - `tmdb_5000_credits.csv`
   - Dataset: [Kaggle TMDB 5000 Movie Dataset](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata)

## Usage

```bash
python app.py
```

Open `http://localhost:5000` in your browser. The model trains automatically on first run (~10s) and is cached for subsequent starts.

## Configuration

All settings are configurable via `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TMDB_API_KEY` | (none) | TMDB API key for poster images |
| `FLASK_PORT` | 5000 | Server port |
| `FLASK_DEBUG` | true | Debug mode |
| `SIMILARITY_THRESHOLD` | 0.15 | Minimum similarity score (0-1) |
| `MIN_COMMON_TAGS` | 2 | Minimum shared tags for a recommendation |
| `MAX_RECOMMENDATIONS` | 5 | Max recommendations returned |
| `MODEL_FILE` | model.joblib | Trained model filename |

## Docker

```bash
docker build -t movie-recommender .
docker run -p 5000:5000 --env-file .env movie-recommender
```

## Testing

```bash
pytest tests/ -v
```

## How It Works

1. **Data Loading** - Merges movie metadata with cast/crew information
2. **Feature Extraction** - Extracts genres, keywords, top 5 actors, director, and production companies
3. **Tag Creation** - Combines all features into weighted tags per movie
4. **Vectorization** - Converts tags to vectors using CountVectorizer (5000 features)
5. **Similarity Calculation** - Cosine similarity across all movie pairs
6. **Recommendation** - Returns top matches above threshold with metadata and poster

## Feature Weights

| Feature | Weight | Rationale |
|---------|--------|-----------|
| Cast | 3x | Strong indicator of similar style |
| Genres | 3x | Core content similarity |
| Production Companies | 3x | Franchise/studio clustering |
| Keywords | 2x | Thematic similarity |
| Director | 2x | Directorial style matching |
| Overview | 1x | Broad plot similarity |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web UI |
| `/api/movies` | GET | All movie titles (for autocomplete) |
| `/api/recommend?movie=<title>` | GET | Get recommendations for a movie |
| `/api/movie-info?id=<tmdb_id>` | GET | Fetch poster/details from TMDB |
