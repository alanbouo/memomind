#!/usr/bin/env python3
"""
Setup script for AI Chat Feature
This script initializes the database with new tables for transcripts and chat messages
"""

from api.database import init_db, engine, Base
from sqlalchemy import inspect

def main():
    print("🚀 Setting up AI Chat Feature...")
    print()
    
    # Check existing tables
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    print(f"📊 Existing tables: {', '.join(existing_tables)}")
    print()
    
    # Initialize database (creates new tables if they don't exist)
    print("🔧 Creating new tables...")
    init_db()
    
    # Check new tables
    inspector = inspect(engine)
    new_tables = inspector.get_table_names()
    
    print(f"✅ Current tables: {', '.join(new_tables)}")
    print()
    
    # Check if new tables were created
    required_tables = ['users', 'transcripts', 'chat_messages']
    missing_tables = [t for t in required_tables if t not in new_tables]
    
    if missing_tables:
        print(f"⚠️  Missing tables: {', '.join(missing_tables)}")
        print("   Please check your database configuration.")
    else:
        print("✅ All required tables exist!")
        print()
        print("🎉 AI Chat Feature setup complete!")
        print()
        print("Next steps:")
        print("1. Add ANTHROPIC_API_KEY to your .env file")
        print("2. Restart your backend server")
        print("3. Upload a new audio file to test the chat feature")

if __name__ == "__main__":
    main()
