import React from 'react';
import { Button, SpaceBetween } from '@cloudscape-design/components';

interface SuggestedQuestionsProps {
  questions: string[];
  onQuestionClick: (question: string) => void;
}

export default function SuggestedQuestions({ questions, onQuestionClick }: SuggestedQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  return (
    <div style={{ marginTop: '10px', paddingLeft: '10px' }}>
      <SpaceBetween direction="vertical" size="xs">
        <div style={{ fontSize: '14px', color: '#5f6b7a' }}>Suggested questions:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {questions.map((question, index) => (
            <Button
              key={index}
              variant="inline-link"
              onClick={() => onQuestionClick(question)}
              className="suggestion-chip"
            >
              {question}
            </Button>
          ))}
        </div>
      </SpaceBetween>
    </div>
  );
}