# Signals POC

A proof-of-concept system for analyzing meeting transcripts and extracting topic signals using AI.

## 🏗️ **Project Structure**

This repository contains two main components:

### **Python Backend** (Root Directory)
- **Pipeline**: AI-powered topic detection and scoring
- **Database**: Supabase integration with PostgreSQL
- **Streamlit UI**: Legacy viewer interface

### **Next.js Frontend** (`signals-fe/` Directory)
- **Modern UI**: React-based dashboard with shadcn/ui
- **Real-time**: Supabase client integration
- **Workflow**: Session management, candidate approval, taxonomy

## 🚀 **Quick Start**

### 1. Python Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment
cp env.example .env
# Edit .env with your Supabase and OpenAI credentials

# Run the legacy Streamlit viewer
python run.py
```

### 2. Next.js Frontend Setup
```bash
# Navigate to frontend
cd signals-fe

# Install dependencies
npm install

# Set up environment
cp env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev
```

### 3. Database Setup
1. Create a Supabase project
2. Run the schema from `supabase/migrations/0001_init.sql`
3. Apply improvements from `signals-fe/supabase-schema-improvements-corrected.sql`

## 📁 **Directory Structure**

```
signals-poc/
├── pipeline/           # Python AI pipeline
├── app/               # Legacy Streamlit viewer
├── supabase/          # Database migrations
├── scripts/           # Setup and migration scripts
├── data/              # Sample data
├── tests/             # Python tests
├── signals-fe/        # Next.js frontend
│   ├── src/           # React components
│   ├── public/        # Static assets
│   └── package.json   # Frontend dependencies
└── requirements.txt   # Python dependencies
```

## 🔧 **Configuration**

### Environment Variables

**Python Backend** (`.env`):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx
OPENAI_API_KEY=your_openai_key
```

**Next.js Frontend** (`signals-fe/.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

## 🎯 **Features**

### Python Backend
- AI-powered topic detection from meeting transcripts
- Topic scoring with time decay
- Supabase database integration
- Streamlit viewer interface

### Next.js Frontend
- Modern dashboard UI
- Session management
- Candidate approval workflow
- Topic taxonomy management
- Real-time mentions tracking
- Settings configuration

## 📚 **Documentation**

- **Backend Setup**: See `SUPABASE_MIGRATION.md`
- **Frontend Setup**: See `signals-fe/SETUP.md`
- **Quick Wins**: See `QUICK_WINS_SETUP.md`

## 🚀 **Development**

### Python Backend
```bash
# Run tests
pytest

# Run pipeline
python -m pipeline.steps

# Run Streamlit viewer
streamlit run app/viewer.py
```

### Next.js Frontend
```bash
cd signals-fe

# Development
npm run dev

# Build
npm run build

# Production
npm start
```

## 🤝 **Contributing**

1. Python backend changes go in the root directory
2. Frontend changes go in the `signals-fe/` directory
3. Database migrations go in `supabase/migrations/`
4. Update documentation as needed


