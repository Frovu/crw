## tables.json

File describes all tables and columns od the database as folows: 

```json
{
	"table_name": {
		"column_name": {
			...
		}
	},
	...
}
```

Tables order is important

Column parameters: 
- `name` specifies the column name visible by user (equal to column_name by default)
- `dtype` time|integer|real|text|enum, real by default
- `enum` [] an array of possible enum values
- `generic` generic column parameters
- `computed` true if column computes automatically
- `references` sql foreign key constraint
- `description` column descrption visible by user
- `parse_name` column name to parse from .txt export
- `parse_value` {} override particular values (used to parse enums)
- `parse_stub` value is transltaed to null when parsed