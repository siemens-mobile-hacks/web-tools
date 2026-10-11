# Project Guidelines

AGENTS.md contains only lasting rules that apply across the project. Do not add task plans, feature requirements, or implementation notes.

## PROJECT ARCHITECTURE

- Follow the architecture, naming, formatting, and error-handling patterns established in the surrounding code.
- Choose the simplest complete solution. Reuse existing utilities and avoid redundant checks, wrappers, abstractions, and comments.
- Add type assertions, runtime checks, validation, and fallbacks only for concrete type constraints, reachable runtime states, or external input boundaries.
- Every runtime check must protect a specific reachable condition. Do not add defensive checks, validation, or tests merely in case an internal invariant is broken.
- Fix underlying causes. Do not retain duplicate implementations or compatibility code for unshipped behavior.
- Keep changes within the task scope and preserve unrelated behavior and public interfaces.
- Use pnpm for package management. Prefer existing dependencies and obtain explicit user approval before installing new ones.
- Preserve SolidJS fine-grained reactivity. Do not destructure reactive props or design components around React-style re-renders.
- Prefer SolidJS primitives and existing patterns over custom reactive abstractions, unnecessary effects, or manual state synchronization.
- Store a single independent persisted preference in a persisted signal. For a related group of settings, define a typed store in `src/store/` and persist the whole state under one key with `makePersistedStore` from `src/utils/store/`; merge stored state with current defaults so new fields remain backward-compatible. Use `createStoreWithApi` when the store owns domain operations that should not be repeated by consumers.
- Debounce persistence when settings can update rapidly, such as during dragging or resizing.

## CODE STYLE

- Keep one component per file. The filename must match the component name.
- Use default exports for page components and named exports for all other components.
- Declare components as const arrow functions with an explicit `Component<Props>` type and a named props interface: `export const ComponentName: Component<ComponentNameProps> = (props) => { ... }`. Components without props may omit the interface; generic components use the equivalent generic form.
- Move large event handlers out of JSX into named functions. Keep render callbacks for `For`, `Show`, and similar JSX helpers inline.
- When a render callback is an element's only child, start it immediately after the opening tag closes: `<For>{() =>`. Do not insert a line or blank line between `>` and `{`.
- Use `undefined` instead of `null` wherever possible. Use `null` only when required by an API, such as DOM APIs.
- Use optional parameter syntax (`value?: Type`) when callers may omit a trailing argument. Use `value: Type | undefined` only when the argument position is required.
- Use explicit named imports instead of namespace imports. `import * as Comlink` is allowed for the Comlink API.
- Declare top-level non-component functions with function declarations, not arrow-function expressions. This does not apply to components.
- A `const` declaration is sufficient by default. Do not add `as const` unless a concrete type constraint requires a const assertion.
- At module scope, do not interleave declaration categories. After imports, use this order: types, global variables, executable statements, classes, functions.
- In multiline ternaries, place `?` and `:` at the end of the preceding line.
- Do not use nested ternary expressions. Use `if`, `else`, or `switch` instead.
- Use multiline JSX for nested elements; avoid unnecessary fragments.
- When a JSX opening tag spans multiple lines, put every attribute on its own line and align the closing `>` with the opening `<`. Do not group attributes on wrapped lines.
- Put children of block-level JSX elements on separate lines. Keep short inline phrasing elements on one line.
- Use braces for `if` statements with an `else` branch or a multiline body.
- Use English (`en`) for all user-facing interface text.
- Prefer standard SUID components, their props, and default theme styles. Do not invent custom styling when standard components can solve the task; add custom styles only when necessary.
- Set page titles through `PageTitle`.
- Use semantic structure and the design system to create a clear visual hierarchy.
- Write short, concrete descriptions. Omit promotional language, repeated information, implementation details, and explanations of obvious interactions.
- Keep related controls, progress, errors, and results together. Disable unavailable actions and allow cancellation of long operations.
- Adapt content width and wrapping to the viewport instead of relying on horizontal page scrolling.
- Provide explicit input labels, clear action labels, accessible names for icon buttons, and keyboard navigation.

## CODE REVIEW

- Before declaring a final code review complete, reread the current `AGENTS.md` and audit the entire diff against every applicable rule one by one, including rules that tests and static checks cannot verify.
- Review correctness, simplicity, architecture, scope, error handling, redundant abstractions, and questionable workarounds. Report concrete unresolved findings with file and line references; do not infer compliance from a successful build or test run.
- Run relevant checks and fix errors introduced by the changes.
- Use Playwright only when browser behavior requires verification. Do not run it routinely after every change.
