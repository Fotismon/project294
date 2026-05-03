.PHONY: install install-backend install-frontend \
        run-backend run-frontend \
        test run-examples \
        lint-backend lint-frontend

install: install-backend install-frontend

install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

run-backend:
	cd backend && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

run-frontend:
	cd frontend && npm run dev

test:
	cd backend && python -m pytest tests/ -v

run-examples:
	python scripts/examples/milp_example.py
	python scripts/examples/milp_response_example.py
	python scripts/examples/diagnostics_example.py
	python scripts/examples/value_diagnostics_example.py
	python scripts/examples/profitability_example.py

lint-backend:
	cd backend && python -m ruff check app/

lint-frontend:
	cd frontend && npm run lint
