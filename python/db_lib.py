import time
import datetime
import sqlite3
from urllib.parse import quote
import requests
import urllib.parse
import urllib.request
import re
import os
from dotenv import load_dotenv

# Load environment variables from .env only if not running in GitHub Actions
if not os.getenv("GITHUB_ACTIONS"):
    load_dotenv()

def article_raw2dict(article_raw):
    article = dict()
    article['id'] = article_raw['dc:identifier'].split(':')[-1]
    article['title'] = article_raw.get('dc:title','N/A')
    article['year'] = article_raw.get('prism:coverDate','N/A')
    article['creator'] = article_raw.get('dc:creator','N/A')
    article['eid'] = article_raw.get('eid','N/A')
    article['journal_str'] = article_raw.get('prism:publicationName','N/A')
    article['journal_id'] = article_raw.get('prism:eIssn','N/A')
    if article['journal_id']=='N/A':
        article['journal_id'] = article_raw.get('prism:issn', 'N/A')
    article['doi'] = article_raw.get('prism:doi','N/A')
    article['abstract'] = article_raw.get('dc:description','N/A')
    article['citations'] = int(article_raw.get('citedby-count','0'))
    article['authors_n'] = article_raw['author-count'].get('@total', 'None')
    article['authors'] = [au['authname'] for au in article_raw['author'] ]
    article['authors_id'] = [au['authid'] for au in article_raw['author'] ]
    article['affiliation'] = [au['afid'] for au in article_raw.get('affiliation',[]) ]
    article['type'] = article_raw.get('subtype','N/A')
    article['type_full'] = article_raw.get('subtypeDescription','N/A')
    article['keywords'] = article_raw.get('authkeywords','N/A')
    article['openaccess'] = article_raw.get('openaccess','N/A')
    article['is_open'] = article_raw.get('openaccessFlag','N/A')
    article['type'] = article_raw.get('subtype', 'N/A')
    article['type_full'] = article_raw.get('subtypeDescription', 'N/A')
    article['funds'] = article_raw.get('fund-no', 'N/A')
    return article

class ScopusAPI:

    def __init__(self):
        self._USERNAME = os.getenv('UNFI_USERNAME')
        self._PASSWORD = os.getenv('UNFI_PASSWORD')
        self._api_key = os.getenv('SCO_API_KEY')
        self.PAC_URL = "https://proxy.unifi.it/proxy.pac"
        self.proxy_address = ScopusAPI.get_proxy_from_pac(self.PAC_URL)
        self._encoded_username = urllib.parse.quote(self._USERNAME)
        self._encoded_password = urllib.parse.quote(self._PASSWORD)

        # Proxy settings with authentication
        self._proxies = {
            # "http": f"http://{self._encoded_username}:{self._encoded_password}@{self.proxy_address}",
            "https": f"https://{self._encoded_username}:{self._encoded_password}@{self.proxy_address}",
        }

        self._headers = {
            "Accept": "application/json",
            "X-ELS-APIKey": self._api_key,
        }

    @staticmethod
    def get_proxy_from_pac(pac_url):
        """Fetch and extract proxy information from the PAC file."""
        try:
            with urllib.request.urlopen(pac_url) as response:
                pac_content = response.read().decode()

            # Extract proxy (Basic pattern search, adjust as needed)
            proxy_match = re.search(r'HTTPS ([^;]+)', pac_content)
            if proxy_match:
                return proxy_match.group(1)
            else:
                print("No proxy found in PAC file.")
                return None
        except Exception as e:
            print("Error fetching PAC file:", e)
            return None

    def get_author(self, author_id):
        url = f"https://api.elsevier.com/content/author/author_id/{author_id}?view=ENHANCED"
        response = requests.get(url, proxies=self._proxies, headers=self._headers)  # , auth=ScopusPAC._auth)
        remaining_req = response.headers.get('X-RateLimit-Remaining', None)
        if remaining_req and int(remaining_req) < 1000:
            print(f"### SCOPUS - WARNING ### Number of requests is: {remaining_req}")

        if response.status_code == 200:
            # Parse the response
            author_data = response.json()
            author_info = author_data['author-retrieval-response'][0]
            preferred_name = author_info['author-profile']['preferred-name']
            author = dict()
            # relevant info
            author['id'] = author_id
            author['surname'] = preferred_name['surname']
            author['name'] = preferred_name['given-name']
            author['auth'] = preferred_name['indexed-name']
            author['affid'] = author_info.get('affiliation-current', dict()).get('@id', None)
            author['area'] = [sa['$'] for sa in author_info['subject-areas']['subject-area']]
            author['citation_count'] = author_info.get('coredata', {}).get('citation-count', 'N/A')
            author['document_count'] = author_info.get('coredata', {}).get('document-count', 'N/A')
            author['h_index'] = author_info.get('h-index', 'N/A')
            author['coauthor_n'] = author_info.get('coauthor-count', 'N/A')
            author['publication_range'] = [
                author_info.get('author-profile', dict()).get('publication-range', dict()).get('@start', 'N/A'),
                author_info.get('author-profile', dict()).get('publication-range', dict()).get('@end', 'N/A')]

            return author
        else:
            print(f"### SCOPUS ### Error {response.status_code}: {response.text}")
            print(f"### SCOPUS ### Response status code: {response.status_code} for author_id: {author_id}")
        return None

    def get_all_articles(self, author_id, start=0, count=25):
        url = f"https://api.elsevier.com/content/search/scopus"
        articles = []
        while True:
            params = {
                "query": f"AU-ID({author_id})",
                "count": count,
                "start": start,
                "view": "COMPLETE",
            }

            response = requests.get(url, proxies=self._proxies, headers=self._headers, params=params)
            remaining_req = response.headers.get('X-RateLimit-Remaining', None)
            if remaining_req and int(remaining_req) < 1000:
                print(f"### SCOPUS - WARNING ### Number of requests is: {remaining_req}")

            if response.status_code == 200:
                articles_data = response.json()
                entries = articles_data.get('search-results', {}).get('entry', [])

                if not entries:
                    break

                articles.extend(entries)

                start += count
                if len(entries) < count:
                    break
            else:
                print(f"Error {response.status_code}: {response.text}")
                break

        return [article_raw2dict(article) for article in articles]

    def get_affiliation(self, affiliation_id):
        url = f"https://api.elsevier.com/content/affiliation/affiliation_id/{affiliation_id}"
        response = requests.get(url, proxies=self._proxies, headers=self._headers)
        remaining_req = response.headers.get('X-RateLimit-Remaining', None)
        if remaining_req and int(remaining_req) < 1000:
            print(f"### SCOPUS - WARNING ### Number of requests is: {remaining_req}")

        if response.status_code == 200:
            affiliation = dict()
            affiliation_info = response.json().get('affiliation-retrieval-response', [{}])
            affiliation['id'] = affiliation_info.get('coredata', {}).get('dc:identifier').split(':')[1]
            affiliation['name'] = affiliation_info.get('affiliation-name', 'N/A')
            affiliation['address'] = affiliation_info.get('address', 'N/A')
            affiliation['city'] = affiliation_info.get('city', 'N/A')
            affiliation['country'] = affiliation_info.get('country', 'N/A')
            affiliation['postal_code'] = affiliation_info.get('institution-profile', {}).get('address', {}).get(
                'postal-code', 'N/A')
            affiliation['publication_count'] = affiliation_info.get('document-count', 'N/A')
            return affiliation #response.json()
        else:
            print(f"### SCOPUS ### Response status code: {response.status_code} for affiliation_id: {affiliation_id}")
        return None

    def get_journal_info(self, journal_id):
        url = f"https://api.elsevier.com/content/serial/title/issn/{journal_id}?view=ENHANCED"
        response = requests.get(url, proxies=self._proxies, headers=self._headers)
        remaining_req = response.headers.get('X-RateLimit-Remaining', None)
        if remaining_req and int(remaining_req) < 1000:
            print(f"### SCOPUS - WARNING ### Number of requests is: {remaining_req}")

        if response.status_code == 200:
            metadata = response.json()
            metadata = metadata.get('serial-metadata-response', {}).get('entry', [{}])[0]
            return {
                'id': (metadata.get('prism:eIssn', None) or metadata.get('prism:issn', None)).replace('-', ''),
                'title': metadata.get('dc:title', 'N/A'),
                'publisher': metadata.get('dc:publisher', 'N/A'),
                'type': metadata.get('prism:aggregationType', 'N/A'),
                'sjr': metadata.get('SJRList', {}).get('SJR', [{}])[0].get('$', '0'),
                'snip': metadata.get('SNIPList', {}).get('SNIP', [{}])[0].get('$', '0'),
                'citescore': metadata.get('citeScoreYearInfoList', {}).get('citeScoreCurrentMetric', '0'),
                'citeScoreTracker': metadata.get('citeScoreYearInfoList', {}).get('citeScoreTracker', '0'),
                'subjects': [subject.get('$', 'N/A') for subject in metadata.get('subject-area', [])]
            }
        else:
            print(f"### SCOPUS ### Response status code: {response.status_code} for journal_id: {journal_id}")
            return None

    def get_article(self, article_id):
        url = f"https://api.elsevier.com/content/abstract/scopus_id/{article_id}?view=FULL"
        response = requests.get(url, proxies=self._proxies, headers=self._headers)
        remaining_req = response.headers.get('X-RateLimit-Remaining', None)
        if remaining_req and int(remaining_req) < 1000:
            print(f"### SCOPUS - WARNING ### Number of requests is: {remaining_req}")

        if response.status_code == 200:
            return response.json()
        else:
            print(f"### SCOPUS ### Response status code: {response.status_code} for article_id: {article_id}")
            return None

class ScopusDB:

    def __init__(self, db_name):
        self.db_name = db_name
        self.connection = None

    def connect(self):
        self.connection = sqlite3.connect(self.db_name)
        self.connection.row_factory = sqlite3.Row  # Fetch rows as dictionaries

    def close(self):
        if self.connection:
            self.connection.close()

    def execute_query(self, query, parameters=None):
        if not self.connection:
            raise ConnectionError("Database is not connected.")

        cursor = self.connection.cursor()
        try:
            if parameters:
                cursor.execute(query, parameters)
            else:
                cursor.execute(query)
            self.connection.commit()
            return cursor
        except sqlite3.Error as e:
            print(f"SQLite Error: {e} - Query:{query}")
            self.connection.rollback()
            return None

    def fetch_all(self, query, parameters=None):
        cursor = self.execute_query(query, parameters)
        if cursor:
            return cursor.fetchall()
        return []

    def fetch_one(self, query, parameters=None):
        cursor = self.execute_query(query, parameters)
        if cursor:
            return cursor.fetchone()
        return None

    def create_tables(self):
        self.connect()
        tables = [
            '''CREATE TABLE IF NOT EXISTS authors (
                id INTEGER PRIMARY KEY,
                surname TEXT NOT NULL,
                name TEXT NOT NULL,
                auth TEXT NOT NULL,
                affid INTEGER,
                citation_count INTEGER DEFAULT 0,
                document_count INTEGER DEFAULT 0,
                h_index INTEGER DEFAULT 0,
                coauthor_count INTEGER DEFAULT 0,
                publication_start_year INTEGER,
                publication_end_year INTEGER,
                area TEXT
            );''',

            '''CREATE TABLE IF NOT EXISTS affiliations (
                id INTEGER PRIMARY KEY,
                name TEXT,
                address TEXT,
                city TEXT,
                country TEXT,
                postal_code TEXT,
                publication_count INTEGER DEFAULT 0
            );''',

            '''CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                year INTEGER NOT NULL,
                creator TEXT,
                eid TEXT,
                journal_id TEXT,
                doi TEXT UNIQUE,
                abstract TEXT,
                citations INTEGER DEFAULT 0,
                authors_n INTEGER DEFAULT 0,
                authors TEXT,
                affiliations TEXT,
                keywords TEXT,
                funds TEXT,
                openaccess TEXT,
                is_open INTEGER DEFAULT 0,
                type TEXT,
                type_full TEXT
            );''',

            '''CREATE TABLE IF NOT EXISTS journals (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                publisher TEXT,
                sjr REAL DEFAULT 0.0,
                snip REAL DEFAULT 0.0,
                citescore REAL DEFAULT 0.0,
                citescore_tracker REAL DEFAULT 0.0,
                subjects TEXT
            );'''
        ]

        for table in tables:
            self.execute_query(table)
        self.close()

    def record_exists(self, table, id):
        """Check if a record exists in the specified table by ID."""
        query = f"SELECT 1 FROM {table} WHERE id = ?"
        result = self.fetch_one(query, (id,))
        return result is not None

    def insert_author(self, author):

        query = '''INSERT INTO authors (id, surname, name, auth, affid, citation_count, document_count, h_index, coauthor_count, publication_start_year, publication_end_year, area)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'''
        self.execute_query(query, (
            author['id'],
            author['surname'],
            author['name'],
            author['auth'],
            author['affid'],
            author['citation_count'],
            author['document_count'],
            author['h_index'],
            author['coauthor_n'],
            author['publication_range'][0],
            author['publication_range'][1],
            ", ".join(author['area']) if author['area'] else None
        ))

    def update_affiliation(self, affiliation_id, updates):
        """
        Updates an existing affiliation record with specified fields.

        Parameters:
        - affiliation_id: The ID of the affiliation to update
        - updates: A dictionary containing the fields to update and their new values
        """
        # Dynamically build the SQL update query and parameter list
        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        parameters = list(updates.values()) + [affiliation_id]

        query = f"UPDATE affiliations SET {set_clause} WHERE id = ?"
        self.execute_query(query, parameters)

    def insert_or_update_affiliation(self, affiliation):
        """
        Inserts a new affiliation or updates the existing one while keeping old values for unspecified fields.

        Parameters:
        - affiliation: A dictionary containing affiliation information
        """
        if self.record_exists("affiliations", affiliation['id']):
            # Fetch existing affiliation data
            existing_affiliation = self.get_affiliation(affiliation['id'])

            # Prepare update values, keeping existing ones if not provided
            updates = {
                "name": affiliation.get('name', existing_affiliation["name"]),
                "address": affiliation.get('address', existing_affiliation["address"]),
                "city": affiliation.get('city', existing_affiliation["city"]),
                "country": affiliation.get('country', existing_affiliation["country"]),
                "postal_code": affiliation.get('postal_code', existing_affiliation["postal_code"]),
                "publication_count": affiliation.get('publication_count', existing_affiliation["publication_count"])
            }

            # Update the existing affiliation
            self.update_affiliation(affiliation['id'], updates)
        else:
            # Perform the insert if the affiliation does not exist
            query = '''INSERT INTO affiliations (id, name, address, city, country, postal_code, publication_count)
                       VALUES (?, ?, ?, ?, ?, ?, ?)'''
            self.execute_query(query, (
                affiliation['id'],
                affiliation.get('name'),
                affiliation.get('address'),
                affiliation.get('city'),
                affiliation.get('country'),
                affiliation.get('postal_code'),
                affiliation.get('publication_count', 0)
            ))

    def insert_article(self, article):

        query = '''INSERT INTO articles (id, title, year, creator, eid, journal_id, doi, abstract, citations, authors_n,authors,affiliations, keywords, funds, openaccess, is_open, type, type_full)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'''
        self.execute_query(query, (
            article['id'],
            article['title'],
            article['year'],
            article['creator'],
            article['eid'],
            article['journal_id'],
            article['doi'],
            article['abstract'],
            article['citations'],
            article['authors_n'],
            '|'.join([author for author in article['authors_id']]),
            '|'.join([affiliations for affiliations in article['affiliation']]),
            article['keywords'],
            article['funds'],
            article['openaccess'],
            1 if article['is_open'] else 0,
            article['type'],
            article['type_full']
        ))

    def update_article(self, article_id, updates):
        """
        Update one or more fields in the articles table for a specific article.

        Parameters:
        - article_id: The ID of the article to update
        - updates: A dictionary where keys are column names and values are the new values
        """
        if not updates:
            raise ValueError("No updates provided.")

        # Check if the article exists
        if not self.record_exists("articles", article_id):
            print(f"Article with ID {article_id} does not exist.")
            return

        set_clause = ", ".join([f"{column} = ?" for column in updates.keys()])
        query = f"UPDATE articles SET {set_clause} WHERE id = ?"
        parameters = list(updates.values()) + [article_id]

        self.execute_query(query, parameters)

    def insert_or_update_article(self, article):
        """
        Inserts a new article or updates the existing one while keeping old values for unspecified fields.

        Parameters:
        - article: A dictionary containing article information
        """
        if self.record_exists("articles", article['id']):
            # Fetch existing article data
            existing_article = self.get_article(article['id'])

            # Prepare update values, keeping existing ones if not provided
            affil = article.get('affiliations', existing_article["affiliations_id"])
            if affil==[None]:
                affil = ''
            else:
                affil = '|'.join(affil)


            updates = {
                "title": article.get('title', existing_article["id"]),
                "year": article.get('year', existing_article["year"]),
                "creator": article.get('creator', existing_article["creator"]),
                "eid": article.get('eid', existing_article["eid"]),
                "journal_id": article.get('journal_id', existing_article["journal_id"]),
                "doi": article.get('doi', existing_article["doi"]),
                "abstract": article.get('abstract', existing_article["abstract"]),
                "citations": article.get('citations', existing_article["citations"]),
                "authors_n": article.get('authors_n', existing_article["authors_n"]),
                "authors": '|'.join(article.get('authors_id', existing_article["authors_id"])),
                "affiliations": affil,
                "keywords": article.get('keywords', existing_article["keywords"]),
                "funds": article.get('funds', existing_article["funds"]),
                "openaccess": article.get('openaccess', existing_article["openaccess"]),
                "is_open": 1 if article.get('is_open', existing_article["is_open"]) else 0,
                "type": article.get('type', existing_article["type"]),
                "type_full": article.get('type_full', existing_article["type_full"])
            }

            # Update the existing article
            self.update_article(article['id'], updates)
        else:
            # Perform the insert if the article does not exist
            query = '''INSERT INTO articles (id, title, year, creator, eid, journal_id, doi, abstract, citations, authors_n, authors, affiliations, keywords, funds, openaccess, is_open, type, type_full)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'''
            self.execute_query(query, (
                article['id'],
                article.get('title'),
                article.get('year'),
                article.get('creator'),
                article.get('eid'),
                article.get('journal_id'),
                article.get('doi'),
                article.get('abstract'),
                article.get('citations', 0),
                article.get('authors_n', 0),
                '|'.join(article.get('authors_id', [])),
                '|'.join(article.get('affiliation', [])),
                article.get('keywords'),
                article.get('funds'),
                article.get('openaccess'),
                1 if article.get('is_open') else 0,
                article.get('type'),
                article.get('type_full')
            ))

    def insert_journal(self, journal):

        query = '''INSERT INTO journals (id, title, publisher, sjr, snip, citescore, citescore_tracker, subjects)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)'''
        self.execute_query(query, (
            journal['id'].replace('-',''),
            journal['title'],
            journal.get('publisher','N/A'),
            float(journal.get('sjr','0')),
            float(journal.get('snip','0')),
            float(journal.get('citescore','0') if journal.get('citescore','0') else '0'),
            float(journal.get('citeScoreTracker','0') if journal.get('citeScoreTracker','0') else '0'),
            ", ".join(journal['subjects']) if journal.get('citeScoreTracker',None) else ''
        ))

    def update_journal(self, journal_id, updates):
        """
        Updates an existing journal record with specified fields.

        Parameters:
        - journal_id: The ID of the journal to update
        - updates: A dictionary containing the fields to update and their new values
        """
        # Dynamically build the SQL update query and parameter list
        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        parameters = list(updates.values()) + [journal_id]

        query = f"UPDATE journals SET {set_clause} WHERE id = ?"
        self.execute_query(query, parameters)

    def insert_or_update_journal(self, journal):
        """
        Inserts a new journal or updates the existing one while keeping old values for unspecified fields.

        Parameters:
        - journal: A dictionary containing journal information
        """
        if self.record_exists("journals", journal['id'].replace('-', '')):
            # Fetch existing journal data
            existing_journal = self.get_journal(journal['id'].replace('-', ''))

            # Prepare update values, keeping existing ones if not provided
            citescore = journal.get('citescore', existing_journal["citescore"])
            citescore_tracker = journal.get('citeScoreTracker', existing_journal["citescore_tracker"])
            updates = {
                "title": journal.get('title', existing_journal["title"]),
                "publisher": journal.get('publisher', existing_journal["publisher"]),
                "sjr": float(journal.get('sjr', existing_journal["sjr"])),
                "snip": float(journal.get('snip', existing_journal["snip"])),
                "citescore": float(citescore) if citescore else 0,
                "citescore_tracker": float(citescore_tracker) if citescore_tracker else 0,
                "subjects": ", ".join(journal.get('subjects', existing_journal["subjects"].split(", ")))
            }

            # Update the existing journal
            self.update_journal(journal['id'].replace('-', ''), updates)
        else:
            # Perform the insert if the journal does not exist
            query = '''INSERT INTO journals (id, title, publisher, sjr, snip, citescore, citescore_tracker, subjects)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)'''
            self.execute_query(query, (
                journal['id'].replace('-', ''),
                journal.get('title'),
                journal.get('publisher', 'N/A'),
                float(journal.get('sjr', '0')),
                float(journal.get('snip', '0')),
                float(journal.get('citescore', '0') if journal.get('citescore', '0') else '0'),
                float(journal.get('citeScoreTracker', '0') if journal.get('citeScoreTracker', '0') else '0'),
                ", ".join(journal.get('subjects', []))
            ))

    def insert_affiliation(self, affiliation):

        query = '''INSERT INTO affiliations (id, name, address, city, country, postal_code, publication_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?)'''
        self.execute_query(query, (
            affiliation['id'],
            affiliation['name'],
            affiliation['address'],
            affiliation['city'],
            affiliation['country'],
            affiliation['postal_code'],
            affiliation['publication_count']
        ))

    def update_affiliation(self, affiliation_id, updates):
        """
        Updates an existing affiliation record with specified fields.

        Parameters:
        - affiliation_id: The ID of the affiliation to update
        - updates: A dictionary containing the fields to update and their new values
        """
        # Dynamically build the SQL update query and parameter list
        set_clause = ", ".join([f"{key} = ?" for key in updates.keys()])
        parameters = list(updates.values()) + [affiliation_id]

        query = f"UPDATE affiliations SET {set_clause} WHERE id = ?"
        self.execute_query(query, parameters)

    def insert_or_update_affiliation(self, affiliation):
        """
        Inserts a new affiliation or updates the existing one while keeping old values for unspecified fields.

        Parameters:
        - affiliation: A dictionary containing affiliation information
        """
        if self.record_exists("affiliations", affiliation['id']):
            # Fetch existing affiliation data
            existing_affiliation = self.get_affiliation(affiliation['id'])

            # Prepare update values, keeping existing ones if not provided
            updates = {
                "name": affiliation.get('name', existing_affiliation["name"]),
                "address": affiliation.get('address', existing_affiliation["address"]),
                "city": affiliation.get('city', existing_affiliation["city"]),
                "country": affiliation.get('country', existing_affiliation["country"]),
                "postal_code": affiliation.get('postal_code', existing_affiliation["postal_code"]),
                "publication_count": affiliation.get('publication_count', existing_affiliation["publication_count"])
            }

            # Update the existing affiliation
            self.update_affiliation(affiliation['id'], updates)
        else:
            # Perform the insert if the affiliation does not exist
            query = '''INSERT INTO affiliations (id, name, address, city, country, postal_code, publication_count)
                       VALUES (?, ?, ?, ?, ?, ?, ?)'''
            self.execute_query(query, (
                affiliation['id'],
                affiliation.get('name'),
                affiliation.get('address'),
                affiliation.get('city'),
                affiliation.get('country'),
                affiliation.get('postal_code'),
                affiliation.get('publication_count', 0)
            ))

    # Getters for Authors
    def get_author(self, author_id):
        query = "SELECT * FROM authors WHERE id = ?"
        row = self.fetch_one(query, (author_id,))
        if row:
            data = dict(row)
            return data
        return None

    # Getters for Journals
    def get_journal(self, journal_id):
        query = "SELECT * FROM journals WHERE id = ?"
        row = self.fetch_one(query, (journal_id,))
        if row:
            data = dict(row)
            return data
        return None

    # Getters for Articles
    def get_article(self, article_id):
        query = "SELECT * FROM articles WHERE id = ?"
        row = self.fetch_one(query, (article_id,))
        if row:
            data = dict(row)
            journal = self.get_journal(data["journal_id"])
            authors = [self.get_author(author_id) for author_id in data["authors"].split("|")]
            affiliations = [self.get_affiliation(aff_id) for aff_id in data["affiliations"].split("|")]
            data['authors'] = authors
            data['authors_id'] = [str(author['id']) for author in authors]
            data['affiliations'] = affiliations
            data['affiliations_id'] = [str(affiliation['id']) if affiliation else None for affiliation in affiliations]
            data['journal'] = journal
            #data_raw = {
            #    "dc:identifier": f"scopus:{data['id']}",
            #    "dc:title": data["title"],
            #    "prism:coverDate": data["year"],
            #    "dc:creator": data["creator"],
            #    "eid": data["eid"],
            #    "prism:publicationName": journal['title'],
            #    "prism:issn": data["journal_id"],
            #    "prism:doi": data["doi"],
            #    "dc:description": data["abstract"],
            #    "citedby-count": data["citations"],
            #    "author-count": {"@total": data["authors_n"]},
            #    "author": [author['id'] for author in authors],
            #    "affiliation": [affiliation['id'] for affiliation in affiliations],
            #    "subtype": data["type"],
            #    "subtypeDescription": data["type_full"],
            #    "authkeywords": data["keywords"],
            #    "fund-no": data["funds"],
            #    "openaccess": data["openaccess"],
            #    "openaccessFlag": data["is_open"]
            #}
            return data
        return None

    # Getters for Affiliations
    def get_affiliation(self, affiliation_id):
        query = "SELECT * FROM affiliations WHERE id = ?"
        row = self.fetch_one(query, (affiliation_id,))
        if row:
            data = dict(row)
            return data
        return None

    def get_all_articles(self):
        query = "SELECT * FROM articles"
        rows = self.fetch_all(query)
        articles = []
        for row in rows:
            data = dict(row)
            journal = self.get_journal(data["journal_id"])
            authors = [self.get_author(author_id) for author_id in data["authors"].split("|") if author_id]
            affiliations = [self.get_affiliation(aff_id) for aff_id in data["affiliations"].split("|") if aff_id]

            article_info = {
                "id": data["id"],
                "title": data["title"],
                "year": data["year"],
                "creator": data["creator"],
                "eid": data["eid"],
                "journal": journal if journal else data["journal_id"],
                "doi": data["doi"],
                "abstract": data["abstract"],
                "citations": data["citations"],
                "authors_n": data["authors_n"],
                "authors": authors if not(all(element is None for element in authors)) else data["authors"].split("|"),
                "affiliations": affiliations if not(all(element is None for element in affiliations)) else data["affiliations"].split("|"),
                "keywords": data["keywords"],
                "funds": data["funds"],
                "openaccess": data["openaccess"],
                "is_open": bool(data["is_open"]),
                "type": data["type"],
                "type_full": data["type_full"]
            }
            articles.append(article_info)

        return articles



