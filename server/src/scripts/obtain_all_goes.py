from datetime import datetime, timedelta, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from data.particles_and_xrays import _obtain_goes
import logging
from database import pool

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
		_obtain_goes('particles', year.timestamp(), end.timestamp())
		year = end

if __name__ == '__main__':
	obtain()
	pool.close()
