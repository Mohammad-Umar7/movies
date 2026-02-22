FROM python:3.11.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user
RUN useradd --create-home appuser

COPY app.py .
COPY templates/ templates/
COPY static/ static/
COPY tmdb_5000_movies.csv .
COPY tmdb_5000_credits.csv .

# Own app files as appuser
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

ENV FLASK_PORT=5000
ENV FLASK_DEBUG=false

CMD ["python", "app.py"]
