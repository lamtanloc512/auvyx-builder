<?php
/**
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

defined( 'ABSPATH' ) || exit;

if ( ! function_exists( 'auvyx_builder_snippet_highlight' ) ) {
	/** Keywords, strings and comments for the code widget. */
	function auvyx_builder_snippet_highlight( string $code ): string {
		$pattern = '/(--[^\n]*|\\/\\/[^\n]*|\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"|`(?:\\\\.|[^`\\\\])*`|\\b(?:import|from|const|let|await|return|select|where|as|function)\\b)/i';
		if ( ! preg_match_all( $pattern, $code, $matches, PREG_OFFSET_CAPTURE ) ) {
			return esc_html( $code );
		}
		$html = '';
		$at   = 0;
		foreach ( $matches[0] as $match ) {
			$raw   = (string) $match[0];
			$start = (int) $match[1];
			$html .= esc_html( substr( $code, $at, $start - $at ) );
			$kind  = ( 0 === strpos( $raw, '//' ) || 0 === strpos( $raw, '--' ) ) ? 'token-comment' : ( ( isset( $raw[0] ) && ( "'" === $raw[0] || '"' === $raw[0] || '`' === $raw[0] ) ) ? 'token-string' : 'token-keyword' );
			$html .= '<span class="' . $kind . '">' . esc_html( $raw ) . '</span>';
			$at    = $start + strlen( $raw );
		}
		return $html . esc_html( substr( $code, $at ) );
	}
}

/**
 * @param array<string, mixed> $attributes Block attributes.
 * @param string               $content    Saved inner HTML (unused).
 * @return string
 */
return static function ( array $attributes, string $content ): string {
	$code     = isset( $attributes['code'] ) ? (string) $attributes['code'] : '';
	$language = isset( $attributes['language'] ) ? sanitize_key( (string) $attributes['language'] ) : 'sql';
	$theme    = ( isset( $attributes['theme'] ) && 'light' === $attributes['theme'] ) ? 'light' : 'dark';
	if ( '' === $code && preg_match( '#<code[^>]*>(.*?)</code>#is', $content, $m ) ) {
		$code = html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES );
	}
	$wrapper = get_block_wrapper_attributes(
		array(
			'class'              => 'auvyx-snippet auvyx-snippet--' . $theme,
			'data-auvyx-snippet' => '1',
			'data-theme'         => $theme,
		)
	);
	return sprintf(
		'<div %1$s><pre><code class="language-%2$s">%3$s</code></pre><button type="button" class="auvyx-snippet__copy" aria-label="%4$s">%4$s</button></div>',
		$wrapper,
		esc_attr( $language ),
		auvyx_builder_snippet_highlight( $code ),
		esc_attr__( 'Copy', 'auvyx-builder' )
	);
};
