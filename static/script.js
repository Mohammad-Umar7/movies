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

// --- Helpers ---

// Create DOM element with attributes: class, text, html, id, style, or any attribute
function el(tag, attrs = {}) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'id') node.id = v;
        else if (k === 'style') node.style.cssText = v;
        else node.setAttribute(k, v);
    }
    return node;
}

// XSS-safe text escaping
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Show icon + message (for error/empty states)
function showMessage(icon, text) {
    const div = el('div', { class: 'error-message', html: `<i class="fas ${icon}"></i>` });
    div.append(el('p', { text }));
    return div;
}

// --- Favorites ---
const FAVORITES_KEY = 'movie_recommender_favorites';

function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; }
    catch { return []; }
}

const isFavorite = title => getFavorites().includes(title);

function toggleFavorite(title) {
    const favs = getFavorites();
    const idx = favs.indexOf(title);
    if (idx > -1) favs.splice(idx, 1);
    else { favs.unshift(title); if (favs.length > 50) favs.pop(); }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    updateFavoriteButtons();
}

function updateFavoriteButtons() {
    document.querySelectorAll('.fav-btn').forEach(btn => {
        const fav = isFavorite(btn.dataset.title);
        btn.querySelector('i').className = `fa${fav ? 's' : 'r'} fa-heart`;
        btn.classList.toggle('is-favorite', fav);
        btn.setAttribute('aria-label', `${fav ? 'Remove' : 'Add'} ${btn.dataset.title} ${fav ? 'from' : 'to'} favorites`);
    });
}

// Load movie titles
fetch('/api/movies').then(r => r.json()).then(data => movies = data);

// Utility
const getMatchClass = m => m >= 40 ? 'high' : m >= 25 ? 'medium' : 'low';

const hideSuggestions = () => {
    suggestionsDiv.classList.remove('active');
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    selectedIndex = -1;
};

const showClearBtn = show => clearBtn.classList.toggle('visible', show);

// --- Search input (debounced) ---
searchInput.addEventListener('input', function () {
    showClearBtn(this.value.length > 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const query = searchInput.value.toLowerCase();
        selectedIndex = -1;
        if (query.length < 2) { hideSuggestions(); return; }

        const matches = movies.filter(m => m.toLowerCase().includes(query)).slice(0, 8);
        if (!matches.length) { hideSuggestions(); return; }

        suggestionsDiv.innerHTML = matches
            .map((m, i) => `<div class="suggestion-item" role="option" id="suggestion-${i}" aria-selected="false">${escapeHtml(m)}</div>`)
            .join('');
        suggestionsDiv.classList.add('active');
        searchInput.setAttribute('aria-expanded', 'true');
    }, 300);
});

// Keyboard navigation
searchInput.addEventListener('keydown', function (e) {
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            updateSelection(items);
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelection(items);
            break;
        case 'Enter':
            e.preventDefault();
            const value = selectedIndex >= 0 && items[selectedIndex] ? items[selectedIndex].textContent : this.value;
            if (value) { searchInput.value = value; hideSuggestions(); getRecommendations(value); }
            break;
        case 'Escape':
            hideSuggestions();
            break;
    }
});

function updateSelection(items) {
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === selectedIndex);
        item.setAttribute('aria-selected', i === selectedIndex ? 'true' : 'false');
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
        searchInput.setAttribute('aria-activedescendant', `suggestion-${selectedIndex}`);
    } else {
        searchInput.removeAttribute('aria-activedescendant');
    }
}

// --- Click handlers ---
suggestionsDiv.addEventListener('click', e => {
    if (!e.target.classList.contains('suggestion-item')) return;
    const movie = e.target.textContent;
    searchInput.value = movie;
    hideSuggestions();
    showClearBtn(true);
    getRecommendations(movie);
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

// --- Movie card builder ---
function createMovieCard(rec, index) {
    const fav = isFavorite(rec.title);

    // Favorite button
    const favBtn = el('button', {
        class: `fav-btn${fav ? ' is-favorite' : ''}`,
        'aria-label': `${fav ? 'Remove' : 'Add'} ${rec.title} ${fav ? 'from' : 'to'} favorites`,
        html: `<i class="fa${fav ? 's' : 'r'} fa-heart"></i>`
    });
    favBtn.dataset.title = rec.title;
    favBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(rec.title); });

    // Poster
    const poster = el('div', { class: 'card-poster', id: `poster-${index}`,
        html: '<div class="poster-placeholder"><i class="fas fa-film"></i></div>' });

    // Header: title + match badge
    const header = el('div', { class: 'card-header' });
    header.append(
        el('div', { class: 'movie-title', text: rec.title }),
        el('div', { class: `match-badge ${getMatchClass(rec.match)}`, text: `${rec.match}% match` })
    );

    // Meta: year + rating
    const meta = el('div', { class: 'movie-meta' });
    if (rec.year) meta.append(el('span', { class: 'meta-year', text: rec.year }));
    if (rec.rating) meta.append(el('span', { class: 'meta-rating', html: `<i class="fas fa-star"></i> ${escapeHtml(String(rec.rating))}` }));

    // Genre badges
    const genres = el('div', { class: 'movie-genres' });
    (rec.genres || []).slice(0, 4).forEach(g => genres.append(el('span', { class: 'genre-badge', text: g })));

    // Reason tags
    const reasons = el('div', { class: 'movie-reasons' });
    rec.reasons.forEach(r => {
        const icon = r.type === 'genre' ? 'fa-masks-theater' : 'fa-tag';
        const span = el('span', { class: `reason-tag reason-${r.type === 'genre' ? 'genre' : 'keyword'}`, html: `<i class="fas ${icon}"></i> ` });
        span.append(document.createTextNode(r.tag));
        reasons.append(span);
    });

    // Assemble details
    const details = el('div', { class: 'card-details' });
    details.append(header, meta, genres);
    if (rec.overview) details.append(el('p', { class: 'movie-overview', text: rec.overview }));
    details.append(reasons);

    // Assemble card
    const content = el('div', { class: 'card-content' });
    content.append(poster, details);

    const card = el('div', { class: 'movie-card', id: `rec-card-${index}`, role: 'article', tabindex: '0' });
    card.setAttribute('aria-label', `Recommendation: ${rec.title}`);
    card.dataset.movieId = rec.movie_id;
    card.append(favBtn, content);

    const activate = () => selectMovie(rec.title);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });

    return card;
}

// --- Fetch and display recommendations ---
function getRecommendations(movie) {
    hint.classList.add('hidden');
    resultsDiv.innerHTML = '<div class="loading"></div>';

    fetch(`/api/recommend?movie=${encodeURIComponent(movie)}`)
        .then(r => r.json())
        .then(data => {
            resultsDiv.innerHTML = '';

            // Not found
            if (data.error) {
                const msg = showMessage('fa-search', `Movie "${movie}" not found.`);
                if (data.suggestions?.length) {
                    msg.append(el('p', { text: 'Did you mean:', style: 'margin-top: 15px' }));
                    const list = el('div', { class: 'suggestions-list' });
                    data.suggestions.forEach(s => {
                        const link = el('span', { class: 'suggestion-link', text: s });
                        link.addEventListener('click', () => selectMovie(s));
                        list.append(link);
                    });
                    msg.append(list);
                }
                resultsDiv.append(msg);
                return;
            }

            // Results header
            const header = el('p', { class: 'results-header', text: 'Recommendations for ' });
            header.append(el('span', { text: data.movie }));
            resultsDiv.append(header);

            // Empty results
            if (!data.recommendations.length) {
                const msg = showMessage('fa-film', data.empty_message || 'No strong matches found for this movie.');
                msg.append(el('p', { text: 'Try a more popular movie for better results.', style: 'font-size: 0.9rem; margin-top: 10px; color: #6b7280' }));
                resultsDiv.append(msg);
            } else {
                data.recommendations.forEach((rec, i) => resultsDiv.append(createMovieCard(rec, i)));
            }

            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Fetch posters async
            data.recommendations.forEach((rec, i) => {
                if (!rec.movie_id) return;
                fetch(`/api/movie-info?id=${rec.movie_id}&title=${encodeURIComponent(rec.title)}`)
                    .then(r => r.json())
                    .then(info => {
                        const div = $(`poster-${i}`);
                        if (!div || !info.poster_url) return;
                        div.innerHTML = '';
                        div.append(el('img', { src: info.poster_url, alt: `${rec.title} poster`, loading: 'lazy' }));
                    })
                    .catch(() => {});
            });
        })
        .catch(() => {
            resultsDiv.innerHTML = '';
            resultsDiv.append(showMessage('fa-exclamation-triangle', 'Something went wrong. Please try again.'));
        });
}

// Select movie (from card click or suggestion)
function selectMovie(movie) {
    searchInput.value = movie;
    showClearBtn(true);
    getRecommendations(movie);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
