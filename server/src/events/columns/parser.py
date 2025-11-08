from lark import Lark, Transformer, v_args

from events.columns.functions import math, select
from events.columns.functions.common import str_literal, num_literal, Value

functions = {
	**math.functions,
	**select.functions
}

helpers = {
	'start': lambda: functions['col'](str_literal('time')),
	'end': lambda: functions['add'](functions['col'](str_literal('time'), functions['col'](str_literal('duration'))))
}

@v_args(inline=True)
class CalculateTree(Transformer):
	def number(self, txt):
		return num_literal(float(txt))
	
	def string(self, txt):
		return str_literal(str(txt))

	def series(self, name):
		return 

	def fn_call(self, name, *args: Value):
		fn = functions.get(name)
		if not fn:
			raise NameError(f'Unknown function: {name}()')
		return fn(*args)
	
	def add(self, *args):
		return self.fn_call('add', *args)
	def sub(self, *args):
		return self.fn_call('sub', *args)
	def mul(self, *args):
		return self.fn_call('mul', *args)
	def div(self, *args):
		return self.fn_call('div', *args)

calc = Lark.open('grammar.lark', rel_to=__file__)


def test():
	expr = "2*$asd"
	res = calc.parse(expr)
	print(res.pretty())
	
	print('=', CalculateTree().transform(res))


if __name__ == '__main__':
	test()