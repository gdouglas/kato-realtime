.PHONY: setup install dev clean lint format test run run-module run-uvicorn

# Environment variables
PYTHON := python
UV := uv
PORT := 8000
HOST := 0.0.0.0

setup:
	$(UV) venv

install:
	$(UV) sync

install-dev:
	$(UV) add --dev pytest pytest-asyncio ruff

dev: run

run:
	$(UV) run main.py

run-module:
	$(UV) run -m server

run-uvicorn:
	$(UV) run -- uvicorn app:app --reload --host $(HOST) --port $(PORT)

lint:
	$(UV) run ruff check .

format:
	$(UV) run ruff format .

clean:
	rm -rf __pycache__
	rm -rf .pytest_cache
	rm -rf .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} +

test:
	$(UV) run -m pytest -v

test-cov:
	$(UV) run -m pytest --cov=. --cov-report=term --cov-report=xml 