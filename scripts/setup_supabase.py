#!/usr/bin/env python3
"""
Setup script for Supabase integration.
"""

import os
import sys
from pathlib import Path

# Add the parent directory to the path so we can import pipeline modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.db import supa, get_topics, log_event


def check_environment():
    """Check if required environment variables are set."""
    required_vars = ["SUPABASE_URL"]
    optional_vars = ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
    
    print("Checking environment variables...")
    
    missing_required = []
    for var in required_vars:
        if not os.environ.get(var):
            missing_required.append(var)
    
    if missing_required:
        print(f"❌ Missing required environment variables: {', '.join(missing_required)}")
        print("Please set these in your .env file or environment.")
        return False
    
    # Check for at least one key
    has_key = any(os.environ.get(var) for var in optional_vars)
    if not has_key:
        print("❌ No Supabase key found. Please set one of:")
        for var in optional_vars:
            print(f"  - {var}")
        return False
    
    print("✅ Environment variables look good!")
    return True


def test_connection():
    """Test the Supabase connection."""
    print("\nTesting Supabase connection...")
    
    try:
        # Try to get the client
        client = supa()
        print("✅ Supabase client created successfully")
        
        # Try a simple query
        response = client.table("topics").select("count", count="exact").execute()
        print("✅ Database connection successful")
        
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False


def create_sample_data():
    """Create some sample data for testing."""
    print("\nCreating sample data...")
    
    try:
        from pipeline.db import upsert_topic, add_alias
        
        # Create some sample topics
        sample_topics = [
            {
                "id": "product_development",
                "label": "Product Development",
                "description": "Topics related to product development and feature planning"
            },
            {
                "id": "customer_feedback",
                "label": "Customer Feedback",
                "description": "Customer feedback and user experience topics"
            },
            {
                "id": "technical_debt",
                "label": "Technical Debt",
                "description": "Technical debt and code quality issues"
            }
        ]
        
        for topic in sample_topics:
            upsert_topic(
                topic_id=topic["id"],
                label=topic["label"],
                description=topic["description"],
                created_by="setup_script"
            )
            print(f"✅ Created topic: {topic['label']}")
        
        # Add some aliases
        aliases = [
            ("product dev", "product_development"),
            ("feature planning", "product_development"),
            ("user feedback", "customer_feedback"),
            ("UX", "customer_feedback"),
            ("tech debt", "technical_debt"),
            ("code quality", "technical_debt")
        ]
        
        for alias, topic_id in aliases:
            add_alias(alias, topic_id)
            print(f"✅ Added alias: '{alias}' -> {topic_id}")
        
        # Log the setup event
        log_event(
            event_type="setup_completed",
            actor="setup_script",
            payload_json={"sample_topics_created": len(sample_topics)}
        )
        
        print("✅ Sample data created successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to create sample data: {e}")
        return False


def verify_data():
    """Verify that data was created correctly."""
    print("\nVerifying data...")
    
    try:
        topics = get_topics()
        print(f"✅ Found {len(topics)} topics in database")
        
        for topic in topics:
            print(f"  - {topic['id']}: {topic['label']}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to verify data: {e}")
        return False


def main():
    """Main setup function."""
    print("🚀 Supabase Setup for Signals POC")
    print("=" * 50)
    
    # Check environment
    if not check_environment():
        print("\nPlease set up your environment variables first.")
        print("Copy env.example to .env and fill in your Supabase credentials.")
        return False
    
    # Test connection
    if not test_connection():
        print("\nPlease check your Supabase configuration.")
        return False
    
    # Create sample data
    if not create_sample_data():
        print("\nFailed to create sample data.")
        return False
    
    # Verify data
    if not verify_data():
        print("\nFailed to verify data.")
        return False
    
    print("\n🎉 Setup completed successfully!")
    print("\nNext steps:")
    print("1. Run the backfill script to migrate existing data:")
    print("   python scripts/backfill_from_runs.py")
    print("2. Start the Streamlit app:")
    print("   streamlit run app/viewer_supabase.py")
    
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
