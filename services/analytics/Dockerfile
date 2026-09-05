FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml ./
RUN pip install --no-cache-dir . 2>/dev/null || pip install --no-cache-dir \
    "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.8" "pydantic-settings>=2.4" \
    "psycopg[binary]>=3.2" "pandas>=2.2" "numpy>=2.0" "scikit-learn>=1.5"
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
