import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        cur.execute("insert into test_items (title, url) values (%s, %s)", ("from python", "https://python.org"))
        cur.execute("select id, title, url from test_items")
        for row in cur.fetchall():
            print(row)
