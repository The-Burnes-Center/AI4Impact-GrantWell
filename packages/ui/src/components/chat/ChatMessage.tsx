import * as React from "react";
import { useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { FaRegStopCircle } from "react-icons/fa";
import ModelMarkdown from "../common/ModelMarkdown";
import TableScrollRegion from "../ui/TableScrollRegion";
import IconButton from "../ui/IconButton";
import styles from "../../styles/chat.module.scss";
import { ChatBotHistoryItem, ChatBotMessageType } from "./types";
import { citationSup } from "./citation-sup";
import { citationsOf, remarkCitationMarkers } from "./citations";
import { useChatPanel } from "./chat-panel-context";
import { grantNameOf } from "../../common/grant-pdf";
import type { Components } from "react-markdown";

import "react-json-view-lite/dist/index.css";
import "../../styles/app.scss";

export interface ChatMessageProps {
  message: ChatBotHistoryItem;
  documentIdentifier?: string;
  replyNumber?: number;
}

/** react-markdown's props without its `node`, which isn't a DOM attribute. */
function domProps<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const copy = { ...props };
  delete copy.node;
  return copy;
}

/** Answer headings start at h2 under the page's h1. */
const MARKDOWN: Components = {
  h1: ({ children, ...props }) => <h2 {...domProps(props)}>{children}</h2>,
  h2: ({ children, ...props }) => <h3 {...domProps(props)}>{children}</h3>,
  h3: ({ children, ...props }) => <h4 {...domProps(props)}>{children}</h4>,
  h4: ({ children, ...props }) => <h5 {...domProps(props)}>{children}</h5>,
  h5: ({ children, ...props }) => <h6 {...domProps(props)}>{children}</h6>,
  h6: ({ children, ...props }) => <h6 {...domProps(props)}>{children}</h6>,
  pre: ({ children, ...props }) => (
    <pre {...domProps(props)} className={styles.codeMarkdown}>
      {children}
    </pre>
  ),
  table: ({ children, ...props }) => (
    <TableScrollRegion label="Table in this answer" className={styles.markdownTableScroll}>
      <table {...domProps(props)} className={styles.markdownTable}>
        {children}
      </table>
    </TableScrollRegion>
  ),
  th: ({ children, ...props }) => (
    <th scope="col" {...domProps(props)}>
      {children}
    </th>
  ),
};

function ChatMessage(props: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const panel = useChatPanel();
  const citations = React.useMemo(() => citationsOf(props.message?.metadata), [props.message?.metadata]);
  const citationPlugins = React.useMemo(() => (citations.length ? [remarkCitationMarkers(citations)] : []), [citations]);
  const reply = props.replyNumber;
  const inPanel = Boolean(panel?.citationsInPanel && reply);
  const showSource = panel?.showSource;
  const components = React.useMemo<Components>(
    () => ({
      ...MARKDOWN,
      sup: citationSup(citations, {
        grant: grantNameOf(props.documentIdentifier),
        onSelect: inPanel && showSource && reply ? (c) => showSource(reply, c.n) : undefined,
      }),
    }),
    [citations, props.documentIdentifier, inPanel, showSource, reply]
  );

  if (props.message.content === "undefined") return null;

  const content = typeof props.message.content === "string" ? props.message.content : "";
  const stopped = props.message.metadata?.stopped === true;

  if (props.message.type !== ChatBotMessageType.AI) {
    return (
      <div className={styles.userTurn}>
        <span className="visually-hidden">You said: </span>
        <span>{content}</span>
      </div>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className={styles.answer} aria-label={reply ? `Answer ${reply}` : "Answer"}>
      {content.length === 0 ? (
        <>
          <span className="visually-hidden">Assistant is typing</span>
          <span className={styles.typingDots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </>
      ) : (
        <ModelMarkdown className={styles.answerMarkdown} remarkPlugins={citationPlugins} components={components}>
          {content}
        </ModelMarkdown>
      )}

      {stopped && (
        <p className={styles.answerStopped}>
          <FaRegStopCircle size={12} aria-hidden="true" />
          Response stopped
        </p>
      )}

      {content.length > 0 && (
        <div className={styles.answerActions}>
          <IconButton label={reply ? `Copy answer ${reply}` : "Copy answer"} tipAlign="start" onClick={handleCopy}>
            {copied ? <LuCheck size={18} aria-hidden="true" /> : <LuCopy size={18} aria-hidden="true" />}
          </IconButton>
          <span role="status" className="visually-hidden">
            {copied ? "Copied" : ""}
          </span>
        </div>
      )}
    </article>
  );
}

export default React.memo(ChatMessage);
