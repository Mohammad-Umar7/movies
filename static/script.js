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

// Load movie titles
fetch('/api/movies')
    .then(r => r.json())
    .then(data => movies = data);

// Utility functions
const escapeQuotes = str => str.replace(/'/g, "\\'");
const getMatchClass = match => match >= 40 ? 'high' : match >= 25 ? 'medium' : 'low';

const hideSuggestions = () => {
    suggestionsDiv.classList.remove('active');
    selectedIndex = -1;
};

const showClearBtn = show => clearBtn.classList.toggle('visible', show);

// Search input handler
searchInput.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    selectedIndex = -1;
    showClearBtn(this.value.length > 0);

    if (query.length < 2) {
        hideSuggestions();
        return;
    }

    const matches = movies.filter(m => m.toLowerCase().includes(query)).slice(0, 8);

    if (matches.length) {
        suggestionsDiv.innerHTML = matches
            .map((m, i) => `<div class="suggestion-item" data-index="${i}">${m}</div>`)
            .join('');
        suggestionsDiv.classList.add('active');
    } else {
        hideSuggestions();
    }
});

// Keyboard navigation
searchInput.addEventListener('keydown', function(e) {
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');
    const len = items.length;

    switch(e.key) {
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
                const suggestions = data.suggestions.length
                    ? `<p style="margin-top: 15px;">Did you mean:</p>
                       <div class="suggestions-list">
                           ${data.suggestions.map(s =>
                               `<span class="suggestion-link" onclick="selectMovie('${escapeQuotes(s)}')">${s}</span>`
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
                html += `
                    <div class="error-message">
                        <i class="fas fa-film"></i>
                        <p>No strong matches found for this movie.</p>
                        <p style="font-size: 0.9rem; margin-top: 10px; color: #6b7280;">
                            Try a more popular movie for better results.
                        </p>
                    </div>`;
            } else {
                html += data.recommendations.map(rec => `
                    <div class="movie-card" onclick="selectMovie('${escapeQuotes(rec.title)}')">
                        <div class="card-header">
                            <div class="movie-title">${rec.title}</div>
                            <div class="match-badge ${getMatchClass(rec.match)}">${rec.match}% match</div>
                        </div>
                        <div class="movie-reasons">
                            ${rec.reasons.map(r => `<span class="reason-tag">${r}</span>`).join('')}
                        </div>
                    </div>
                `).join('');
            }

            resultsDiv.innerHTML = html;
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
