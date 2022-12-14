import gzip
import os
import logging
import logging.handlers

if not os.path.exists('logs'):
    os.makedirs('logs')
def rotator(source, dest):
    with open(source, 'rb') as sf:
        data = sf.read()
        compressed = gzip.compress(data)
        with open(dest+'.gz', 'wb') as df:
            df.write(compressed)
    os.remove(source)

formatter = logging.Formatter('%(asctime)s/%(levelname)s: %(message)s')
log_rotate = logging.handlers.TimedRotatingFileHandler('logs/aid.log', 'midnight')
log_rotate.rotator = rotator
log_rotate.setLevel(logging.DEBUG)
log_rotate.setFormatter(formatter)

sh = logging.StreamHandler()
sh.setFormatter(formatter)

logger = logging.getLogger('aides')
logger.handlers = [ log_rotate, sh ]
logger.setLevel(logging.DEBUG)
logger.propagate = False

logging.getLogger('werkzeug').setLevel(logging.WARNING)
import requests
logging.getLogger('urllib3').setLevel(logging.WARNING)
logging.getLogger('urllib3').propagate = False

logger.critical('STARTING SERVER')

from flask import Flask, session
from routers import admin
from routers import events
from routers import neutron

app = Flask('aides')

@app.after_request
def after_request(response):
    if cors := os.environ.get('CORS_ORIGIN'):
        response.headers['Access-Control-Allow-Origin'] = cors
        response.headers['Access-Control-Allow-Headers'] = '*'
        response.headers['Access-Control-Allow-Methods'] = '*'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

app.register_blueprint(admin.bp)
app.register_blueprint(events.bp)
app.register_blueprint(neutron.bp)
