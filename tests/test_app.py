import json
import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, normalize_title, clean_text, extract_names


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestNormalizeTitle:
    def test_removes_spaces(self):
        assert normalize_title("The Dark Knight") == "thedarkknight"

    def test_removes_colons(self):
        assert normalize_title("Spider-Man: Homecoming") == "spidermanhomecoming"

    def test_lowercases(self):
        assert normalize_title("AVATAR") == "avatar"

    def test_empty_string(self):
        assert normalize_title("") == ""


class TestCleanText:
    def test_removes_short_words(self):
        result = clean_text("This is a big adventure in the world")
        assert "big" not in result
        assert "adventure" in result

    def test_removes_stop_words(self):
        result = clean_text("this movie about adventure")
        assert "this" not in result
        assert "adventure" in result

    def test_removes_punctuation(self):
        result = clean_text("amazing! fantastic, wonderful.")
        assert "amazing" in result
        assert "fantastic" in result

    def test_empty_string(self):
        assert clean_text("") == []


class TestExtractNames:
    def test_basic_extraction(self):
        data = '[{"name": "Action"}, {"name": "Comedy"}]'
        assert extract_names(data) == ["Action", "Comedy"]

    def test_with_limit(self):
        data = '[{"name": "A"}, {"name": "B"}, {"name": "C"}]'
        result = extract_names(data, limit=2)
        assert len(result) == 2
        assert result == ["A", "B"]

    def test_with_job_filter(self):
        data = '[{"name": "John", "job": "Director"}, {"name": "Jane", "job": "Writer"}]'
        result = extract_names(data, job="Director")
        assert result == ["John"]

    def test_invalid_input(self):
        assert extract_names("not valid json") == []
        assert extract_names("") == []

    def test_spaces_removed(self):
        data = '[{"name": "Robert Downey Jr."}]'
        result = extract_names(data)
        assert result == ["RobertDowneyJr."]


class TestHomeEndpoint:
    def test_returns_html(self, client):
        response = client.get('/')
        assert response.status_code == 200
        assert b'Movie Recommender' in response.data


class TestMoviesEndpoint:
    def test_returns_list(self, client):
        response = client.get('/api/movies')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) > 0

    def test_contains_known_movie(self, client):
        response = client.get('/api/movies')
        data = json.loads(response.data)
        titles_lower = [t.lower() for t in data]
        assert 'avatar' in titles_lower


class TestRecommendEndpoint:
    def test_valid_movie(self, client):
        response = client.get('/api/recommend?movie=Avatar')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'movie' in data
        assert 'recommendations' in data

    def test_missing_param(self, client):
        response = client.get('/api/recommend?movie=')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['error'] == 'missing_param'

    def test_no_movie_param(self, client):
        response = client.get('/api/recommend')
        assert response.status_code == 400

    def test_too_long_input(self, client):
        response = client.get(f'/api/recommend?movie={"x" * 201}')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['error'] == 'invalid_input'

    def test_not_found_movie(self, client):
        response = client.get('/api/recommend?movie=zzznotarealmovie')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['error'] == 'not_found'

    def test_returns_metadata(self, client):
        response = client.get('/api/recommend?movie=Avatar')
        data = json.loads(response.data)
        if data.get('recommendations'):
            rec = data['recommendations'][0]
            assert 'year' in rec
            assert 'genres' in rec
            assert 'rating' in rec
            assert 'overview' in rec
            assert 'movie_id' in rec
            assert 'reasons' in rec
            # Reasons should be categorized
            assert isinstance(rec['reasons'], list)
            if rec['reasons']:
                assert 'tag' in rec['reasons'][0]
                assert 'type' in rec['reasons'][0]

    def test_movie_id_in_response(self, client):
        response = client.get('/api/recommend?movie=Avatar')
        data = json.loads(response.data)
        assert 'movie_id' in data


class TestMovieInfoEndpoint:
    def test_missing_id(self, client):
        response = client.get('/api/movie-info')
        assert response.status_code == 400

    def test_invalid_id(self, client):
        response = client.get('/api/movie-info?id=abc')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data['error'] == 'invalid_id'
