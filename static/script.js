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

// Favorites
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
        btn.innerHTML = `<i class="fa${isFav ? 's' : 'r'} fa-heart"></i>`;
        btn.classList.toggle('is-favorite', isFav);
        btn.setAttribute('aria-label', isFav ? `Remove ${title} from favorites` : `Add ${title} to favorites`);
    });
}

// Load movie titles
fetch('/api/movies')
    .then(r => r.json())
    .then(data => movies = data);

// Utility functions
const escapeAttr = str => str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
const getMatchClass = match => match >= 40 ? 'high' : match >= 25 ? 'medium' : 'low';

const hideSuggestions = () => {
    suggestionsDiv.classList.remove('active');
    searchInput.setAttribute('aria-expanded', 'false');
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
                .map((m, i) => `<div class="suggestion-item" role="option" data-index="${i}">${m}</div>`)
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
    items.forEach((item, i) => item.classList.toggle('selected', i === selectedIndex));
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
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

// Get recommendations
function getRecommendations(movie) {
    hint.classList.add('hidden');
    resultsDiv.innerHTML = '<div class="loading"></div>';

    fetch(`/api/recommend?movie=${encodeURIComponent(movie)}`)
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                const suggestions = data.suggestions && data.suggestions.length
                    ? `<p style="margin-top: 15px;">Did you mean:</p>
                       <div class="suggestions-list">
                           ${data.suggestions.map(s =>
                        `<span class="suggestion-link" onclick="selectMovie('${escapeAttr(s)}')">${s}</span>`
                    ).join('')}
                       </div>`
                    : '';

                resultsDiv.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-search"></i>
                        <p>Movie "${movie}" not found.</p>
                        ${suggestions}
                    </div>`;
                return;
            }

            let html = `<p class="results-header">Recommendations for <span>${data.movie}</span></p>`;

            if (!data.recommendations.length) {
                const msg = data.empty_message || 'No strong matches found for this movie.';
                html += `
                    <div class="error-message">
                        <i class="fas fa-film"></i>
                        <p>${msg}</p>
                        <p style="font-size: 0.9rem; margin-top: 10px; color: #6b7280;">
                            Try a more popular movie for better results.
                        </p>
                    </div>`;
            } else {
                html += data.recommendations.map((rec, index) => `
                    <div class="movie-card" onclick="selectMovie('${escapeAttr(rec.title)}')"
                         role="article" aria-label="Recommendation: ${escapeAttr(rec.title)}"
                         data-movie-id="${rec.movie_id}" id="rec-card-${index}">
                        <button class="fav-btn" data-title="${escapeAttr(rec.title)}"
                                onclick="event.stopPropagation(); toggleFavorite('${escapeAttr(rec.title)}')"
                                aria-label="Add ${escapeAttr(rec.title)} to favorites">
                            <i class="fa${isFavorite(rec.title) ? 's' : 'r'} fa-heart"></i>
                        </button>
                        <div class="card-content">
                            <div class="card-poster" id="poster-${index}">
                                <div class="poster-placeholder"><i class="fas fa-film"></i></div>
                            </div>
                            <div class="card-details">
                                <div class="card-header">
                                    <div class="movie-title">${rec.title}</div>
                                    <div class="match-badge ${getMatchClass(rec.match)}">${rec.match}% match</div>
                                </div>
                                <div class="movie-meta">
                                    ${rec.year ? `<span class="meta-year">${rec.year}</span>` : ''}
                                    ${rec.rating ? `<span class="meta-rating"><i class="fas fa-star"></i> ${rec.rating}</span>` : ''}
                                </div>
                                <div class="movie-genres">
                                    ${(rec.genres || []).slice(0, 4).map(g => `<span class="genre-badge">${g}</span>`).join('')}
                                </div>
                                ${rec.overview ? `<p class="movie-overview">${rec.overview}</p>` : ''}
                                <div class="movie-reasons">
                                    ${rec.reasons.map(r => {
                        const icon = r.type === 'genre' ? 'fa-masks-theater' : 'fa-tag';
                        return `<span class="reason-tag reason-${r.type}"><i class="fas ${icon}"></i> ${r.tag}</span>`;
                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            resultsDiv.innerHTML = html;
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Fetch posters asynchronously
            data.recommendations.forEach((rec, index) => {
                if (rec.movie_id) {
                    fetch(`/api/movie-info?id=${rec.movie_id}&title=${encodeURIComponent(rec.title)}`)
                        .then(r => r.json())
                        .then(info => {
                            const posterDiv = document.getElementById(`poster-${index}`);
                            if (posterDiv && info.poster_url) {
                                posterDiv.innerHTML = `<img src="${info.poster_url}" alt="${escapeAttr(rec.title)} poster" loading="lazy">`;
                            }
                        })
                        .catch(() => { });
                }
            });
        })
        .catch(() => {
            resultsDiv.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Something went wrong. Please try again.</p>
                </div>`;
        });
}

// Select movie
function selectMovie(movie) {
    searchInput.value = movie;
    showClearBtn(true);
    getRecommendations(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
