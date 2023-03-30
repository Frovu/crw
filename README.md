# cr-aid
**A**pprehend **I**nterplanetary **D**isturbances - An interactive Furbush effect catalog

# Notes

## Generic columns

POI hour is only included when offset is zero or offset is positive and event starts at hour start:
```
[ons] (18:40) -> 18:40
[ons]+<1> (18:00) -> 18:00
[ons]+<1> (18:59) -> 19:00
[ons]+<2> (18:00) -> [18:00, 19:00]
[ons]+<2> (18:59) -> [19:00, 20:00]
[ons]-<1> (18:00) -> 17:00
[ons]-<1> (18:59) -> 17:00
[ons]-<3> (18:00) -> [15:00, 17:00]
[ons]-<3> (18:59) -> [15:00, 17:00]
```

When averaging over a window missing data count is checked to be `<= floor(length / 2)`

Event's right boundary **(not inclusive)** is defined as follows:
- Start hour + duration if duration exists
- Or else the first hour of next event (if offset <= 48h)
- Or else start hour + 48 hours 