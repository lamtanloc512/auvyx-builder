<?php
/**
 * Auvyx Vector: an SVG path from attributes. Path data and viewBox are reduced to numbers and path commands, so the
 * markup cannot carry anything else and authors without unfiltered_html can use vectors (like Auvyx Icon).
 * Fill and stroke come from the block's styles (CSS `fill`, `stroke`, `stroke-width`), inherited by the path.
 *
 * @package Auvyx\Builder
 * @var array<string, mixed> $attributes
 */

defined( 'ABSPATH' ) || exit;

$auvyx_builder_path = isset( $attributes['path'] ) && is_string( $attributes['path'] ) ? substr( $attributes['path'], 0, 50000 ) : '';
$auvyx_builder_box  = isset( $attributes['viewBox'] ) && is_string( $attributes['viewBox'] ) ? $attributes['viewBox'] : '0 0 100 100';

// Only SVG path commands, numbers and separators.
if ( ! preg_match( '/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/', $auvyx_builder_path ) ) {
	$auvyx_builder_path = '';
}
// Four numbers.
if ( ! preg_match( '/^-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?){3}$/', trim( $auvyx_builder_box ) ) ) {
	$auvyx_builder_box = '0 0 100 100';
}

printf(
	'<span %1$s><svg xmlns="http://www.w3.org/2000/svg" viewBox="%2$s" preserveAspectRatio="none" aria-hidden="true"><path d="%3$s" vector-effect="non-scaling-stroke"/></svg></span>',
	get_block_wrapper_attributes( array( 'aria-hidden' => 'true' ) ), // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
	esc_attr( trim( $auvyx_builder_box ) ),
	esc_attr( $auvyx_builder_path )
);
