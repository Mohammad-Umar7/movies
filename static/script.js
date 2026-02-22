// DOM Elements
const $ = id => document.getElementById(id);
const searchInput = $('search');
const suggestionsDiv = $('suggestions');
const resultsDiv = $('results');
const clearBtn = $('clearBtn');
const hint = $('hint');

// State
let movies = [];
let selectedIndex = -1;
let debounceTimer = null;

// --- XSS-safe text escaping ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Favorites (uses raw titles, never escaped) ---
const FAVORITES_KEY = 'movie_recommender_favorites';

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    } catch { return []; }
}

function isFavorite(title) {
    return getFavorites().includes(title);
}

function toggleFavorite(title) {
    let favs = getFavorites();
    const idx = favs.indexOf(title);
    if (idx > -1) {
        favs.splice(idx, 1);
    } else {
        favs.unshift(title);
        if (favs.length > 50) favs.pop();
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    updateFavoriteButtons();
}

function updateFavoriteButtons() {
    document.querySelectorAll('.fav-btn').forEach(btn => {
        const title = btn.dataset.title;
        const isFav = isFavorite(title);
        btn.querySelector('i').className = `fa${isFav ? 's' : 'r'} fa-heart`;
        btn.classList.toggle('is-favorite', isFav);
        btn.setAttribute('aria-label', isFav ? `Remove ${title} from favorites` : `Add ${title} to favorites`);
    });
}

// Load movie titles
fetch('/api/movies')
    .then(r => r.json())
    .then(data => movies = data);

// Utility
const getMatchClass = match => match >= 40 ? 'high' : match >= 25 ? 'medium' : 'low';

const hideSuggestions = () => {
    suggestionsDiv.classList.remove('active');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    selectedIndex = -1;
};

const showClearBtn = show => clearBtn.classList.toggle('visible', show);

// Search input — clear button stays instant, suggestions are debounced
searchInput.addEventListener('input', function () {
    showClearBtn(this.value.length > 0);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const query = searchInput.value.toLowerCase();
        selectedIndex = -1;

        if (query.length < 2) {
            hideSuggestions();
            return;
        }

        const matches = movies.filter(m => m.toLowerCase().includes(query)).slice(0, 8);

        if (matches.length) {
            suggestionsDiv.innerHTML = matches
                .map((m, i) => `<div class="suggestion-item" role="option" id="suggestion-${i}" aria-selected="false" data-index="${i}">${escapeHtml(m)}</div>`)
                .join('');
            suggestionsDiv.classList.add('active');
            searchInput.setAttribute('aria-expanded', 'true');
        } else {
            hideSuggestions();
        }
    }, 300);
});

// Keyboard navigation
searchInput.addEventListener('keydown', function (e) {
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');
    const len = items.length;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, len - 1);
            updateSelection(items);
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelection(items);
            break;
        case 'Enter':
            e.preventDefault();
            const value = selectedIndex >= 0 && items[selectedIndex]
                ? items[selectedIndex].textContent
                : this.value;
            if (value) {
                searchInput.value = value;
                hideSuggestions();
                getRecommendations(value);
            }
            break;
        case 'Escape':
            hideSuggestions();
            break;
    }
});

function updateSelection(items) {
    items.forEach((item, i) => {
        const isSelected = i === selectedIndex;
        item.classList.toggle('selected', isSelected);
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
        searchInput.setAttribute('aria-activedescendant', `suggestion-${selectedIndex}`);
    } else {
        searchInput.removeAttribute('aria-activedescendant');
    }
}

// Click handlers
suggestionsDiv.addEventListener('click', e => {
    if (e.target.classList.contains('suggestion-item')) {
        const movie = e.target.textContent;
        searchInput.value = movie;
        hideSuggestions();
        showClearBtn(true);
        getRecommendations(movie);
    }
});

clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    showClearBtn(false);
    hideSuggestions();
    resultsDiv.innerHTML = '';
    hint.classList.remove('hidden');
    searchInput.focus();
});

document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) hideSuggestions();
});

// --- Safe DOM builder helpers ---
function createMovieCard(rec, index) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.setAttribute('role', 'article');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Recommendation: ${rec.title}`);
    card.dataset.movieId = rec.movie_id;
    card.id = `rec-card-${index}`;

    // Favorite button
    const favBtn = document.createElement('button');
    favBtn.className = `fav-btn${isFavorite(rec.title) ? ' is-favorite' : ''}`;
    favBtn.dataset.title = rec.title;
    favBtn.setAttribute('aria-label', isFavorite(rec.title) ? `Remove ${rec.title} from favorites` : `Add ${rec.title} to favorites`);
    favBtn.innerHTML = `<i class="fa${isFavorite(rec.title) ? 's' : 'r'} fa-heart"></i>`;
    favBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleFavorite(rec.title);
    });

    // Card content wrapper
    const content = document.createElement('div');
    content.className = 'card-content';

    // Poster
    const poster = document.createElement('div');
    poster.className = 'card-poster';
    poster.id = `poster-${index}`;
    poster.innerHTML = '<div class="poster-placeholder"><i class="fas fa-film"></i></div>';

    // Details
    const details = document.createElement('div');
    details.className = 'card-details';

    // Header row
    const header = document.createElement('div');
    header.className = 'card-header';
    const titleEl = document.createElement('div');
    titleEl.className = 'movie-title';
    titleEl.textContent = rec.title;
    const badge = document.createElement('div');
    badge.className = `match-badge ${getMatchClass(rec.match)}`;
    badge.textContent = `${rec.match}% match`;
    header.append(titleEl, badge);

    // Meta row
    const meta = document.createElement('div');
    meta.className = 'movie-meta';
    if (rec.year) {
        const year = document.createElement('span');
        year.className = 'meta-year';
        year.textContent = rec.year;
        meta.appendChild(year);
    }
    if (rec.rating) {
        const rating = document.createElement('span');
        rating.className = 'meta-rating';
        rating.innerHTML = `<i class="fas fa-star"></i> ${escapeHtml(String(rec.rating))}`;
        meta.appendChild(rating);
    }

    // Genres
    const genres = document.createElement('div');
    genres.className = 'movie-genres';
    (rec.genres || []).slice(0, 4).forEach(g => {
        const span = document.createElement('span');
        span.className = 'genre-badge';
        span.textContent = g;
        genres.appendChild(span);
    });

    // Overview
    let overviewEl = null;
    if (rec.overview) {
        overviewEl = document.createElement('p');
        overviewEl.className = 'movie-overview';
        overviewEl.textContent = rec.overview;
    }

    // Reasons
    const reasons = document.createElement('div');
    reasons.className = 'movie-reasons';
    rec.reasons.forEach(r => {
        const span = document.createElement('span');
        span.className = `reason-tag reason-${r.type === 'genre' ? 'genre' : 'keyword'}`;
        const icon = r.type === 'genre' ? 'fa-masks-theater' : 'fa-tag';
        span.innerHTML = `<i class="fas ${icon}"></i> `;
        span.appendChild(document.createTextNode(r.tag));
        reasons.appendChild(span);
    });

    details.append(header, meta, genres);
    if (overviewEl) details.appendChild(overviewEl);
    details.appendChild(reasons);
    content.append(poster, details);
    card.append(favBtn, content);

    // Click and keyboard handlers (no inline onclick)
    const activate = () => selectMovie(rec.title);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
        }
    });

    return card;
}

// Get recommendations
function getRecommendations(movie) {
    hint.classList.add('hidden');
    resultsDiv.innerHTML = '<div class="loading"></div>';

    fetch(`/api/recommend?movie=${encodeURIComponent(movie)}`)
        .then(r => r.json())
        .then(data => {
            resultsDiv.innerHTML = '';

            if (data.error) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.innerHTML = '<i class="fas fa-search"></i>';
                const p = document.createElement('p');
                p.textContent = `Movie "${movie}" not found.`;
                errorDiv.appendChild(p);

                if (data.suggestions && data.suggestions.length) {
                    const didYouMean = document.createElement('p');
                    didYouMean.style.marginTop = '15px';
                    didYouMean.textContent = 'Did you mean:';
                    errorDiv.appendChild(didYouMean);

                    const list = document.createElement('div');
                    list.className = 'suggestions-list';
                    data.suggestions.forEach(s => {
                        const link = document.createElement('span');
                        link.className = 'suggestion-link';
                        link.textContent = s;
                        link.addEventListener('click', () => selectMovie(s));
                        list.appendChild(link);
                    });
                    errorDiv.appendChild(list);
                }

                resultsDiv.appendChild(errorDiv);
                return;
            }

            const headerP = document.createElement('p');
            headerP.className = 'results-header';
            headerP.textContent = 'Recommendations for ';
            const headerSpan = document.createElement('span');
            headerSpan.textContent = data.movie;
            headerP.appendChild(headerSpan);
            resultsDiv.appendChild(headerP);

            if (!data.recommendations.length) {
                const msg = data.empty_message || 'No strong matches found for this movie.';
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'error-message';
                emptyDiv.innerHTML = '<i class="fas fa-film"></i>';
                const emptyP = document.createElement('p');
                emptyP.textContent = msg;
                emptyDiv.appendChild(emptyP);
                const tipP = document.createElement('p');
                tipP.style.cssText = 'font-size: 0.9rem; margin-top: 10px; color: #6b7280;';
                tipP.textContent = 'Try a more popular movie for better results.';
                emptyDiv.appendChild(tipP);
                resultsDiv.appendChild(emptyDiv);
            } else {
                data.recommendations.forEach((rec, index) => {
                    resultsDiv.appendChild(createMovieCard(rec, index));
                });
            }

            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Fetch posters asynchronously
            data.recommendations.forEach((rec, index) => {
                if (rec.movie_id) {
                    fetch(`/api/movie-info?id=${rec.movie_id}&title=${encodeURIComponent(rec.title)}`)
                        .then(r => r.json())
                        .then(info => {
                            const posterDiv = document.getElementById(`poster-${index}`);
                            if (posterDiv && info.poster_url) {
                                const img = document.createElement('img');
                                img.src = info.poster_url;
                                img.alt = `${rec.title} poster`;
                                img.loading = 'lazy';
                                posterDiv.innerHTML = '';
                                posterDiv.appendChild(img);
                            }
                        })
                        .catch(() => { });
                }
            });
        })
        .catch(() => {
            resultsDiv.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'error-message';
            errDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            const errP = document.createElement('p');
            errP.textContent = 'Something went wrong. Please try again.';
            errDiv.appendChild(errP);
            resultsDiv.appendChild(errDiv);
        });
}

// Select movie
function selectMovie(movie) {
    searchInput.value = movie;
    showClearBtn(true);
    getRecommendations(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
