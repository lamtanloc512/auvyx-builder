<?php
/**
 * Auvyx Icon: SVG from the generated icon set (trusted data), so authors without unfiltered_html can use icons.
 *
 * @package Auvyx\Builder
 * @var array<string, mixed> $attributes
 */

defined( 'ABSPATH' ) || exit;

$auvyx_builder_icons = Auvyx\Builder\Plugin::shared_data( 'icons' )['icons'];
$auvyx_builder_name  = isset( $attributes['icon'] ) && is_string( $attributes['icon'] ) ? $attributes['icon'] : 'star';

$auvyx_builder_href  = isset( $attributes['href'] ) && is_string( $attributes['href'] ) ? $attributes['href'] : '';
$auvyx_builder_tag   = '' === $auvyx_builder_href ? 'span' : 'a';
$auvyx_builder_extra = '' === $auvyx_builder_href ? array( 'aria-hidden' => 'true' ) : array(
	'href'       => esc_url( $auvyx_builder_href ),
	'aria-label' => $auvyx_builder_name,
);

printf(
	'<%1$s %2$s><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%3$s</svg></%1$s>',
	$auvyx_builder_tag, // phpcs:ignore WordPress.Security.EscapeOutput -- literal tag name.
	get_block_wrapper_attributes( $auvyx_builder_extra ), // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
	$auvyx_builder_icons[ $auvyx_builder_name ] ?? '' // phpcs:ignore WordPress.Security.EscapeOutput -- generated, trusted SVG paths.
);
