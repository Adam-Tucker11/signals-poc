#!/usr/bin/env python3
"""
Test script for Supabase integration.
"""

import os
import sys
from pathlib import Path

# Add the parent directory to the path so we can import pipeline modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.db import (
    supa, get_topics, get_topic_aliases, get_pending_candidates,
    upsert_topic, add_alias, log_event
)


def test_connection():
    """Test basic connection."""
    print("Testing Supabase connection...")
    try:
        client = supa()
        response = client.table("topics").select("count", count="exact").execute()
        print(f"✅ Connection successful. Found {response.count} topics.")
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False


def test_topics():
    """Test topic operations."""
    print("\nTesting topic operations...")
    try:
        # Create a test topic
        test_topic_id = "test_topic"
        upsert_topic(test_topic_id, "Test Topic", "A test topic for validation")
        print("✅ Created test topic")
        
        # Add an alias
        add_alias("test", test_topic_id)
        print("✅ Added test alias")
        
        # Get topics
        topics = get_topics()
        print(f"✅ Retrieved {len(topics)} topics")
        
        # Get aliases
        aliases = get_topic_aliases()
        print(f"✅ Retrieved {len(aliases)} aliases")
        
        return True
    except Exception as e:
        print(f"❌ Topic operations failed: {e}")
        return False


def test_candidates():
    """Test candidate operations."""
    print("\nTesting candidate operations...")
    try:
        candidates = get_pending_candidates()
        print(f"✅ Retrieved {len(candidates)} pending candidates")
        return True
    except Exception as e:
        print(f"❌ Candidate operations failed: {e}")
        return False


def test_logging():
    """Test event logging."""
    print("\nTesting event logging...")
    try:
        log_event(
            event_type="test_completed",
            actor="test_script",
            payload_json={"test": True, "status": "success"}
        )
        print("✅ Event logged successfully")
        return True
    except Exception as e:
        print(f"❌ Event logging failed: {e}")
        return False


def main():
    """Run all tests."""
    print("🧪 Supabase Integration Tests")
    print("=" * 40)
    
    tests = [
        ("Connection", test_connection),
        ("Topics", test_topics),
        ("Candidates", test_candidates),
        ("Logging", test_logging),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        if test_func():
            passed += 1
        print()
    
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Supabase integration is working correctly.")
        return True
    else:
        print("❌ Some tests failed. Please check your configuration.")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
