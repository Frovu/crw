from lark import Lark, Transformer, v_args

from events.columns.context import ComputationContext
from events.columns.functions import math_op, select_op
from events.columns.functions.common import str_literal, num_literal, Value

functions = {
	**math_op.functions,
	**select_op.functions
}

helpers = {
	'start': lambda: functions['col'](str_literal('time')),
	'end': lambda: functions['add'](functions['col'](str_literal('time'), functions['col'](str_literal('duration'))))
}

@v_args(inline=True)
class ColumnComputer(Transformer):
	def __init__(self, visit_tokens: bool = True, target_ids: list[int] | None = None) -> None:
		super().__init__(visit_tokens)
		self.ctx = ComputationContext()

	def number(self, txt):
		return num_literal(float(txt))
	
	def string(self, txt):
		return str_literal(str(txt)[1:-1])

	def series(self, name):
		return 

	def fn_call(self, name, *args: Value):
		fn = functions.get(name)
		if not fn:
			raise NameError(f'Unknown function: {name}()')
		return fn(args, self.ctx)
	
	def add(self, *args):
		return self.fn_call('add', *args)
	def sub(self, *args):
		return self.fn_call('sub', *args)
	def mul(self, *args):
		return self.fn_call('mul', *args)
	def div(self, *args):
		return self.fn_call('div', *args)

columnParser = Lark.open('grammar.lark', rel_to=__file__)

def test():
	expr = "col(\"time\")"
	res = columnParser.parse(expr)
	print(res.pretty())
	
	print('=', ColumnComputer().transform(res))
