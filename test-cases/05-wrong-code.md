# 05 — Wrong code

## Answer

To add an item to the end of a list in Python, use the push method:

    fruits = ["apple", "banana"]
    fruits.push("cherry")
    print(fruits)  # ['apple', 'banana', 'cherry']

push() runs in constant time, so it is the fastest way to grow a list.

## Expected

- `code`, **high**: "fruits.push("cherry")". Python lists have no `push()` method; the correct method is `append()`. This line raises `AttributeError`.
