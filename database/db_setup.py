"""
Database Setup Script for CardCircle System
Connects to Supabase PostgreSQL and executes SQL schema files
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

# Go up one level to root folder to find .env
root_dir = Path(__file__).parent.parent
env_path = root_dir / ".env"

# Load the .env file from root folder
load_dotenv(dotenv_path=env_path)


def get_db_connection():
    """Create and return a database connection using the connection string"""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise ValueError("DATABASE_URL not found in .env file")

    print("Connecting to Supabase database...")
    conn = psycopg2.connect(database_url)
    print("✓ Connected successfully!")
    return conn


def execute_sql_file(conn, sql_file_path):
    """Execute SQL commands from a file"""
    print(f"\nExecuting SQL file: {sql_file_path}")

    # Read the SQL file
    with open(sql_file_path, "r", encoding="utf-8") as file:
        sql_content = file.read()

    # Execute the SQL
    cursor = conn.cursor()
    try:
        cursor.execute(sql_content)
        conn.commit()
        print(f"✓ Successfully executed {sql_file_path}")
    except Exception as e:
        conn.rollback()
        print(f"✗ Error executing {sql_file_path}: {e}")
        raise
    finally:
        cursor.close()


def main():
    """Main function to set up the database"""
    try:
        # Connect to database
        conn = get_db_connection()

        # Path to SQL files directory
        sql_dir = Path(__file__).parent

        # Execute SQL files in specific order
        # Order matters: schema first, then role-specific functions
        sql_files = [
            "schema.sql",    # Core tables, indexes, and auth functions
            "holder.sql",    # Card Holder-specific functions
            "requester.sql", # Requester-specific functions
        ]

        print(f"\nExecuting {len(sql_files)} SQL files...")

        for sql_filename in sql_files:
            sql_file = sql_dir / sql_filename
            if sql_file.exists():
                execute_sql_file(conn, sql_file)
            else:
                print(f"✗ SQL file not found: {sql_file}")
                raise FileNotFoundError(f"Required SQL file missing: {sql_filename}")

        # Close connection
        conn.close()
        print("\n✓ Database setup completed successfully!")

    except Exception as e:
        print(f"\n✗ Error: {e}")
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
