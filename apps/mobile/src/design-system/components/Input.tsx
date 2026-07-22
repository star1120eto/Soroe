import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Border, Colors, Radius, Spacing, Typography } from '../tokens';

// docs/DesignSystem.pdf 04 (Input). States: プレースホルダ／入力済み／フォーカス／エラー.
type InputProps = Omit<TextInputProps, 'style'> & {
  errorMessage?: string;
};

export function Input({ errorMessage, onFocus, onBlur, ...textInputProps }: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const hasError = Boolean(errorMessage);

  const borderColor = hasError ? Colors.danger : isFocused ? Border.selected.color : Border.input.color;
  const borderWidth = hasError || isFocused ? Border.selected.width : Border.input.width;

  return (
    <View>
      <TextInput
        {...textInputProps}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={Colors.textSecondary}
        accessibilityState={{ disabled: textInputProps.editable === false }}
        style={[Typography.body, styles.input, { borderColor, borderWidth }]}
      />
      {hasError ? <Text style={[Typography.caption, styles.errorText]}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: Radius.input,
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing[4],
  },
  errorText: {
    color: Colors.danger,
    marginTop: Spacing[1],
  },
});
