type Listener = (event: { type: string; target: MiniElement }) => void;

export class MiniElement {
  readonly tagName: string;
  parentNode: MiniElement | null = null;
  readonly childNodes: Array<MiniElement | MiniText> = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Listener[]>();
  className = '';
  hidden = false;
  title = '';
  type = '';
  checked = false;
  width = 0;
  height = 0;
  private readonly canvasContext = {
    strokeStyle: '',
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    stroke(): void {},
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get id(): string {
    return this.attributes.get('id') ?? '';
  }

  set id(value: string) {
    this.attributes.set('id', value);
  }

  get firstChild(): MiniElement | MiniText | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    this.childNodes.splice(0, this.childNodes.length);
    if (value !== '') {
      this.childNodes.push(new MiniText(value));
    }
  }

  append(...nodes: Array<MiniElement | MiniText | string>): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.appendChild(new MiniText(node));
      } else {
        this.appendChild(node);
      }
    }
  }

  appendChild(node: MiniElement | MiniText): MiniElement | MiniText {
    if (node instanceof MiniElement && node.parentNode) {
      node.parentNode.removeChild(node);
    }
    if (node instanceof MiniElement) {
      node.parentNode = this;
    }
    this.childNodes.push(node);
    return node;
  }

  removeChild(node: MiniElement | MiniText): MiniElement | MiniText {
    const index = this.childNodes.indexOf(node);
    if (index < 0) {
      throw new Error('not a child');
    }
    this.childNodes.splice(index, 1);
    if (node instanceof MiniElement) {
      node.parentNode = null;
    }
    return node;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'class') {
      this.className = value;
    }
    if (name === 'id') {
      this.id = value;
    }
    if (name === 'hidden') {
      this.hidden = true;
    }
  }

  getAttribute(name: string): string | null {
    if (name === 'class' && this.className !== '' && !this.attributes.has('class')) {
      return this.className;
    }
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'hidden') {
      this.hidden = false;
    }
  }

  addEventListener(type: string, listener: Listener): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  click(): void {
    this.dispatch('click');
  }

  dispatch(type: string): void {
    const event = { type, target: this };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  getContext(kind: string): typeof this.canvasContext | null {
    return kind === '2d' ? this.canvasContext : null;
  }

  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    const matches: MiniElement[] = [];
    walk(this, (element) => {
      if (element !== this && matchesSelector(element, selector)) {
        matches.push(element);
      }
    });
    return matches;
  }
}

export class MiniText {
  textContent: string;

  constructor(value: string) {
    this.textContent = value;
  }
}

export class MiniDocument extends MiniElement {
  constructor() {
    super('document');
  }

  createElement(tag: string): MiniElement {
    return new MiniElement(tag);
  }

  override querySelectorAll(selector: string): MiniElement[] {
    const matches: MiniElement[] = [];
    walk(this, (element) => {
      if (element !== this && matchesSelector(element, selector)) {
        matches.push(element);
      }
    });
    return matches;
  }
}

export function createDashboardDocument(): MiniDocument {
  const document = new MiniDocument();
  const lastRefreshed = document.createElement('p');
  lastRefreshed.id = 'last-refreshed';
  lastRefreshed.textContent = 'Last refreshed: n/a';
  const autoRefresh = document.createElement('input');
  autoRefresh.id = 'auto-refresh';
  autoRefresh.type = 'checkbox';
  const refresh = document.createElement('button');
  refresh.id = 'refresh';
  refresh.type = 'button';
  refresh.textContent = 'Refresh';
  const sections = ['overview', 'market', 'paper', 'performance', 'research', 'health'] as const;
  for (const name of sections) {
    const button = document.createElement('button');
    button.className = 'nav-btn';
    button.setAttribute('data-section', name);
    button.textContent = name;
    document.append(button);
    const section = document.createElement('section');
    section.id = `section-${name}`;
    if (name !== 'overview') {
      section.hidden = true;
    }
    document.append(section);
  }
  document.append(lastRefreshed, autoRefresh, refresh);
  return document;
}

function walk(node: MiniElement, visit: (element: MiniElement) => void): void {
  visit(node);
  for (const child of node.childNodes) {
    if (child instanceof MiniElement) {
      walk(child, visit);
    }
  }
}

function matchesSelector(element: MiniElement, selector: string): boolean {
  if (selector.startsWith('#')) {
    return element.id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return element.className.split(/\s+/).includes(selector.slice(1));
  }
  return element.tagName === selector.toUpperCase();
}
