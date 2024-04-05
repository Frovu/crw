
from threading import Thread
from time import time

import traceback
from database import log

class Operation:
	def __init__(self, func, args):
		self.data = None
		self.error = None
		self.progress = [0, 1]
		self.started = time()
		self.finished = None
		self.status = 'working'
		self.thread = Thread(target=self.run, args=[func, args])
		self.thread.start()

	def run(self, func, args):
		try:
			res = func(self.progress, *args)
			self.finished = time()
			self.status = 'done'
			self.data = res
		except Exception as e:
			self.finished = time()
			self.status = 'error'
			self.error = e
			log.error('Operation failed: %s\n%s', str(e), traceback.format_exc())

	def as_dict(self):
		res = { 'status': self.status, 'started': self.started }
		if self.status != 'done':
			res['progress'] = self.progress[0] / self.progress[1]
		if self.finished:
			res['finished'] = self.finished
		if self.data:
			res['data'] = self.data
		if self.error:
			res['error'] = str(self.error)
		return res

class OperationCache:
	def __init__(self):
		self.cache = {}

	def fetch(self, func, args):
		found = self.cache.get(args)

		if not found:
			op = Operation(func, args)
			self.cache[args] = op
			return op.as_dict()

		if found.status != 'working':
			del self.cache[args]
		return found.as_dict()
