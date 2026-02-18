import React from "react";

interface ContentBoxProps {
  children: React.ReactNode;
  backgroundColor?: string;
}

const ContentBox: React.FC<ContentBoxProps> = ({
  children,
  backgroundColor = "#f1f6f9",
}) => (
  <div className="content-box" style={{ backgroundColor }}>
    <div className="content-box__inner">{children}</div>
  </div>
);

export default ContentBox;
