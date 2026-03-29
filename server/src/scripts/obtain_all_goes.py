from datetime import datetime, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from data.particles_and_xrays import fetch
import logging
from database import pool
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s:%(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout
)
EPOCH = datetime(1986, 1, 1, tzinfo=timezone.utc)

def obtain():
	year = EPOCH
	while year < datetime.now(timezone.utc):
		end = year.replace(year=year.year + 1)
		fetch('particles', year.timestamp(), end.timestamp(), ['p1'])
		print(year.year, 'OK')
		year = end

if __name__ == '__main__':
	obtain()
	pool.close()
