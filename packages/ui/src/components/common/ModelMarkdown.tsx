import ReactMarkdown, { type Components, type Options, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

const modelUrlTransform: UrlTransform = (url) =>
  /^(?:https|mailto):/i.test(url) ? url : null;

const SAFE_COMPONENTS: Components = {
  img({ alt }) {
    return alt ? <>{alt}</> : null;
  },
  a({ href, title, children }) {
    if (!href) return <>{children}</>;
    return (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
        {/^https:/i.test(href) && <span className="visually-hidden"> (opens in new tab)</span>}
      </a>
    );
  },
};

interface ModelMarkdownProps {
  children: string;
  className?: string;
  components?: Components;
  remarkPlugins?: Options["remarkPlugins"];
}

/**
 * Markdown written by the model. Its text can echo grant documents and uploads, so it never
 * loads images (an image URL can carry data out) and links only to https: or mailto: addresses.
 */
export default function ModelMarkdown({ children, className, components, remarkPlugins = [] }: ModelMarkdownProps) {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm, ...remarkPlugins]}
      urlTransform={modelUrlTransform}
      components={{ ...components, ...SAFE_COMPONENTS }}
    >
      {children}
    </ReactMarkdown>
  );
}
