from lark import Lark, Transformer, v_args

from events.columns.context import ComputationContext
from events.columns.functions import math_op, select_op, series_op, bool_op, interval_op
from events.columns.functions.common import str_literal, num_literal, Value

functions = {
	**select_op.functions,
	**series_op.functions,
	**interval_op.functions,
	**math_op.functions,
	**bool_op.functions,
}

helpers = {
	'start': lambda ctx: functions['col']([str_literal('time')], ctx),
	'end': lambda ctx: functions['add']([functions['col']([str_literal('time')], ctx), functions['col']([str_literal('duration')], ctx)], ctx),
	'dur': lambda ctx: functions['col']([str_literal('duration')], ctx),
	'mc_start': lambda ctx: functions['col']([str_literal('MC time')], ctx),
	'mc_end': lambda ctx: functions['add']([functions['col']([str_literal('MC time')], ctx), functions['col']([str_literal('MC duration')], ctx)], ctx),
}

helpers_desc = {
	'start': ('FEID start', 'col("time")'),
	'end': ('FEID end', 'col("time") + col("duration")'),
	'mc_start': ('MC start', 'col("MC time")'),
	'mc_end': ('MC end', 'col("MC time") + col("MC duration")'),
}

@v_args(inline=True)
class ColumnComputer(Transformer):
	def __init__(self, visit_tokens: bool = True, target_ids: list[int] | None = None):
		super().__init__(visit_tokens)
		self.ctx = ComputationContext(target_ids)

	def number(self, txt):
		return num_literal(float(txt))
	
	def string(self, txt):
		return str_literal(str(txt)[1:-1])

	def series(self, name):
		return self.fn_call('ser', str_literal(name))
	
	def helper(self, name):
		fn = helpers.get(name)
		if not fn:
			raise NameError(f'Unknown helper: @{name}')
		return fn(self.ctx)

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
	
	def lt(self, *args):
		return self.fn_call('lt', *args)
	def le(self, *args):
		return self.fn_call('le', *args)
	def eq(self, *args):
		return self.fn_call('eq', *args)
	def ne(self, *args):
		return self.fn_call('ne', *args)
	def gt(self, *args):
		return self.fn_call('gt', *args)
	def ge(self, *args):
		return self.fn_call('ge', *args)

columnParser = Lark.open('grammar.lark', rel_to=__file__)

def test():
	expr = "col(\"time\")"
	res = columnParser.parse(expr)
	print(res.pretty())
	
	print('=', ColumnComputer().transform(res))
