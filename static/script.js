let movies = [];
let selectedIndex = -1;
const searchInput = document.getElementById('search');
const suggestionsDiv = document.getElementById('suggestions');
const resultsDiv = document.getElementById('results');
const clearBtn = document.getElementById('clearBtn');
const hint = document.getElementById('hint');

// Load all movie titles for autocomplete
fetch('/api/movies')
    .then(res => res.json())
    .then(data => movies = data);

// Search input handler
searchInput.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    selectedIndex = -1;

    // Toggle clear button
    if (this.value.length > 0) {
        clearBtn.classList.add('visible');
    } else {
        clearBtn.classList.remove('visible');
    }

    if (query.length < 2) {
        suggestionsDiv.classList.remove('active');
        return;
    }

    const matches = movies
        .filter(m => m.toLowerCase().includes(query))
        .slice(0, 8);

    if (matches.length > 0) {
        suggestionsDiv.innerHTML = matches
            .map((m, i) => `<div class="suggestion-item" data-index="${i}">${m}</div>`)
            .join('');
        suggestionsDiv.classList.add('active');
    } else {
        suggestionsDiv.classList.remove('active');
    }
});

// Keyboard navigation for suggestions
searchInput.addEventListener('keydown', function(e) {
    const items = suggestionsDiv.querySelectorAll('.suggestion-item');

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelection(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelection(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
            const movie = items[selectedIndex].textContent;
            searchInput.value = movie;
            suggestionsDiv.classList.remove('active');
            getRecommendations(movie);
        } else if (this.value) {
            suggestionsDiv.classList.remove('active');
            getRecommendations(this.value);
        }
    } else if (e.key === 'Escape') {
        suggestionsDiv.classList.remove('active');
        selectedIndex = -1;
    }
});

function updateSelection(items) {
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === selectedIndex);
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

// Click on suggestion
suggestionsDiv.addEventListener('click', function(e) {
    if (e.target.classList.contains('suggestion-item')) {
        const movie = e.target.textContent;
        searchInput.value = movie;
        suggestionsDiv.classList.remove('active');
        clearBtn.classList.add('visible');
        getRecommendations(movie);
    }
});

// Clear button
clearBtn.addEventListener('click', function() {
    searchInput.value = '';
    clearBtn.classList.remove('visible');
    suggestionsDiv.classList.remove('active');
    resultsDiv.innerHTML = '';
    hint.classList.remove('hidden');
    searchInput.focus();
});

// Hide suggestions when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-box')) {
        suggestionsDiv.classList.remove('active');
    }
});

// Get recommendations from API
function getRecommendations(movie) {
    hint.classList.add('hidden');
    resultsDiv.innerHTML = '<div class="loading"></div>';

    fetch(`/api/recommend?movie=${encodeURIComponent(movie)}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                let html = `<div class="error-message">
                    <i class="fas fa-search"></i>
                    <p>Movie "${movie}" not found.</p>`;

                if (data.suggestions.length > 0) {
                    html += `<p style="margin-top: 15px;">Did you mean:</p><div class="suggestions-list">`;
                    data.suggestions.forEach(s => {
                        html += `<span class="suggestion-link" onclick="selectMovie('${s.replace(/'/g, "\\'")}')">${s}</span>`;
                    });
                    html += `</div>`;
                }
                html += `</div>`;
                resultsDiv.innerHTML = html;
                return;
            }

            let html = `<p class="results-header">Recommendations for <span>${data.movie}</span></p>`;

            if (data.recommendations.length === 0) {
                html += `<div class="error-message">
                    <i class="fas fa-film"></i>
                    <p>No strong matches found for this movie.</p>
                    <p style="font-size: 0.9rem; margin-top: 10px; color: #6b7280;">Try a more popular movie for better results.</p>
                </div>`;
            } else {
                data.recommendations.forEach(rec => {
                    const matchClass = rec.match >= 40 ? 'high' : rec.match >= 25 ? 'medium' : 'low';
                    html += `
                        <div class="movie-card" onclick="selectMovie('${rec.title.replace(/'/g, "\\'")}')">
                            <div class="card-header">
                                <div class="movie-title">${rec.title}</div>
                                <div class="match-badge ${matchClass}">${rec.match}% match</div>
                            </div>
                            <div class="movie-reasons">
                                ${rec.reasons.map(r => `<span class="reason-tag">${r}</span>`).join('')}
                            </div>
                        </div>
                    `;
                });
            }

            resultsDiv.innerHTML = html;

            // Smooth scroll to results
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(err => {
            resultsDiv.innerHTML = `<div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Something went wrong. Please try again.</p>
            </div>`;
        });
}

// Select movie from error suggestions or card click
function selectMovie(movie) {
    searchInput.value = movie;
    clearBtn.classList.add('visible');
    getRecommendations(movie);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
