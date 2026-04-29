# Battery Analyst Console

Monorepo skeleton for a future battery analytics console. It contains a FastAPI backend, a Next.js TypeScript frontend, shared data space, and project documentation.

How to run - Backend:
source /Users/project294/.venv/bin/activate
cd /Users/project294/battery-analyst-console/backend
pip install -r requirements.txt
uvicorn app.main:app --reload

How to run - Frontend:
cd /Users/project294/battery-analyst-console/frontend
npm install
npm run dev
npm run build