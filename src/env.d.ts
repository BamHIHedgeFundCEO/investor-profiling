interface ImportMetaEnv {
  readonly VITE_ANALYZER?: 'gemini' | 'rule_based';
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
