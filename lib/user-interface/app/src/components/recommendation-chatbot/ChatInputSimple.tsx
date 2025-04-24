import React, { useState } from 'react';
import { Button, SpaceBetween, Spinner } from '@cloudscape-design/components';
import TextareaAutosize from 'react-textarea-autosize';

interface ChatInputSimpleProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function ChatInputSimple({ 
  onSendMessage, 
  isLoading,
  disabled = false 
}: ChatInputSimpleProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    const trimmedMessage = inputValue.trim();
    if (trimmedMessage) {
      onSendMessage(trimmedMessage);
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

return (
    <div style={{ 
        display: 'flex',
        alignItems: 'flex-end',
        gap: '8px',
        padding: '10px',
        borderTop: '1px solid #eaeded'
    }}>
         <TextareaAutosize
            style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                resize: 'none',
                fontFamily: 'inherit',
                fontSize: 14,
            }}
            minRows={2}
            maxRows={4}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask about available grants…"
            disabled={disabled}
            />
        <Button
            iconAlign="right"
            iconName={!isLoading ? "angle-right-double" : undefined}
            onClick={handleSend}
            disabled={disabled || inputValue.trim() === ''}
            variant="primary"
        >
            {isLoading ? (
                <>
                    Sending&nbsp;&nbsp;
                    <Spinner />
                </>
            ) : (
                "Send"
            )}
        </Button>
    </div>
);
}