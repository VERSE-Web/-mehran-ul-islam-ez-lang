<<<<<<< HEAD
# Ez

A small scripting language that blends JS-style braces with Python-style `def`-ish
function syntax, built to run on Node. Files use the `.ez` extension.

## Running a script

```
node index.js path/to/script.ez
```

Or install it as a global CLI:

```
npm install -g .
ez path/to/script.ez
```

## Language guide

### Variables
Only `let` — no `var`.

```
let name = "Mehran"
let count = 3
```

### Printing

```
print.console("logs like console.log")
print.alert("goes to stderr, like a browser alert")
```

### Functions

Define with `function "Name" = { ... }`. A zero-arg function can be invoked
just by writing its bare name as a statement. Functions with parameters are
called normally with parens.

```
function "Hello" = {
    print.console("Hello! world")
}
Hello              // calls it, zero-arg style

function "square"(x) = {
    return x * x
}
print.console(square(6))   // 36
```

Functions can recurse and return values normally with `return`.

### Control flow

```
if (x < 10) {
    print.console("small")
} else {
    print.console("big")
}

while (i < 3) {
    print.console(i)
    i = i + 1
}

for (let j = 0; j < 3; j = j + 1) {
    print.console(j)
}
```

### Arrays

```
let nums = [1, 2, 3]
print.console(nums[0])
nums[0] = 99
```

### Input (reads a line from the terminal)

```
let n = input.from("your-name")
print.console("Hi " + n)
```

`input.from("id")` is a terminal stand-in for the web idea of
`document.getElementById` — it can't reach into a real DOM from a CLI script
(there isn't one), so it prompts on stdin instead, labeled by the id you pass.

### HTTP requests

```
let res = get("https://pypi.org/pypi/requests/json")
print.console(res.ok)       // true/false
print.console(res.status)   // 200
print.console(res.text)     // raw response body
print.console(res.data)     // parsed JSON, if the response was JSON
print.console(res.data.info.name)
```

`get()` performs a real HTTP GET request and blocks until it completes —
no `async`/`await` needed in Ez scripts.

## Running in a browser (replacing inline JS)

There's also a browser build at `browser/ez.js` that lets `.ez` code run directly
inside an HTML page — no Node needed on the visitor's end.

```html
<script src="ez.js"></script>

<script type="text/ez">
    function "Hello" = {
        print.console("Ez loaded and running in the browser!")
    }
    Hello
</script>
```

Drop `<script type="text/ez">` tags anywhere you'd normally put a JS `<script>`
tag — inline, or with `src="somefile.ez"`. They run in order, top to bottom,
same as regular scripts, and share one global scope across all of them on
the page.

In the browser, the built-ins behave differently than the CLI version, in
ways that make more sense for a webpage:

- `input.from("id")` → now genuinely does `document.getElementById("id").value`,
  reading a real form field off the page
- `print.alert(x)` → a real `window.alert(x)` popup
- `print.console(x)` → `console.log(x)`, shows up in devtools like normal
- `get(url)` → a real HTTP GET, still made to look blocking/synchronous
  (Ez has no `async`/`await`). Under the hood this uses a deprecated
  synchronous `XMLHttpRequest`, which freezes page interaction while the
  request is in flight — fine for demos and small tools, not something to
  build a production site's data-fetching around.

### Wiring up HTML events

Ez doesn't have its own `onclick`-style syntax yet, so call an Ez function
straight from HTML using the `EzRuntime` bridge that `ez.js` exposes:

```html
<input id="nameBox" type="text">
<button onclick="EzRuntime.call('greet')">Greet me</button>

<script type="text/ez">
    function "greet" = {
        let name = input.from("nameBox")
        print.console("Hi " + name)
    }
</script>
```

See `browser/example.html` for a full working page with this pattern.



- `lexer.js` — turns source text into tokens
- `parser.js` — recursive-descent parser, tokens → AST
- `interpreter.js` — tree-walking evaluator, AST → running program
- `http-get-helper.js` — child-process helper so `get()` can look synchronous
- `index.js` — CLI entry point
- `examples/` — sample `.ez` scripts

## What's next (not built yet)

- Real browser/DOM support (`input.from` actually reaching a webpage) would
  need a separate transpile-to-JS mode, since a Node CLI script has no DOM.
- Objects/dictionaries currently only exist as a runtime type produced by
  parsed JSON — there's no `{ key: value }` literal syntax yet.
- No module/import system yet for splitting a project across multiple `.ez`
  files.
=======
"# A08-API-NO1" 
"# A08-API-NO1" 
>>>>>>> 50738e39b65d9d58ec9a1cec406b6c457f06e3f3
