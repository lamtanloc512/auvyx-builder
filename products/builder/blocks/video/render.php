<?php
/**
 * Auvyx Video: rendered from the URL so no iframe is stored in post content (kses-safe for every role).
 * Mirrors Embed.scala (Auvyx Studio) and embed.ts (block editor).
 *
 * @package Auvyx\Builder
 * @var array<string, mixed> $attributes
 */

defined( 'ABSPATH' ) || exit;

$auvyx_builder_url = isset( $attributes['url'] ) && is_string( $attributes['url'] ) ? $attributes['url'] : '';

// A box's background video (Studio: Section → Background video): muted, looping, no controls, hidden from assistive
// tech. Mirrors Embed.background() in Embed.scala.
if ( in_array( 'auvyx-bg-video', explode( ' ', (string) ( $attributes['className'] ?? '' ) ), true ) ) {
	$auvyx_builder_bg = trim( $auvyx_builder_url );
	// With sound (Studio: Sound), video.js turns it on: the players keep their message APIs open (Embed.background).
	$auvyx_builder_sound = in_array( 'auvyx-video-autoplay', explode( ' ', (string) ( $attributes['className'] ?? '' ) ), true );
	if ( preg_match( '~^https?://[^\s"\'<>]+\.(?:mp4|webm|ogv)(?:\?[^\s"\'<>]*)?$~i', $auvyx_builder_bg ) ) {
		$auvyx_builder_media = sprintf( '<video src="%s" autoplay muted loop playsinline preload="metadata"></video>', esc_url( $auvyx_builder_bg ) );
	} elseif ( preg_match( '~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,20})~', $auvyx_builder_bg, $auvyx_builder_m ) ) {
		$auvyx_builder_media = sprintf( '<iframe src="%s" title="" tabindex="-1" loading="lazy" allow="autoplay; encrypted-media"></iframe>', esc_url( 'https://www.youtube-nocookie.com/embed/' . $auvyx_builder_m[1] . '?autoplay=1&mute=1&loop=1&playlist=' . $auvyx_builder_m[1] . '&controls=0&playsinline=1&rel=0' . ( $auvyx_builder_sound ? '&enablejsapi=1' : '' ) ) );
	} elseif ( preg_match( '~vimeo\.com/(?:video/)?(\d{5,12})~', $auvyx_builder_bg, $auvyx_builder_m ) ) {
		$auvyx_builder_media = sprintf( '<iframe src="%s" title="" tabindex="-1" loading="lazy" allow="autoplay"></iframe>', esc_url( 'https://player.vimeo.com/video/' . $auvyx_builder_m[1] . ( $auvyx_builder_sound ? '?autoplay=1&loop=1&muted=1&controls=0&playsinline=1' : '?background=1&autoplay=1&loop=1&muted=1' ) ) );
	} else {
		return;
	}
	printf( '<div %s aria-hidden="true"%s>%s</div>', get_block_wrapper_attributes(), $auvyx_builder_sound ? ' data-auvyx-autoplay="1"' : '', $auvyx_builder_media ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above and by core.
	return;
}
// A player that starts by itself (Studio: Settings → Autoplay): muted at first, which every browser allows; video.js
// (VideoAutoplay module) turns the sound on as soon as the browser allows it and adds a sound on/off button.
// Mirrors Embed.autoplayUrl and the autoplay branch of HtmlRenderer.
if ( in_array( 'auvyx-video-autoplay', explode( ' ', (string) ( $attributes['className'] ?? '' ) ), true ) ) {
	$auvyx_builder_src = trim( $auvyx_builder_url );
	if ( preg_match( '~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,20})~', $auvyx_builder_src, $auvyx_builder_m ) ) {
		$auvyx_builder_media = sprintf( '<iframe src="%s" title="%s" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>', esc_url( 'https://www.youtube-nocookie.com/embed/' . $auvyx_builder_m[1] . '?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1' ), esc_attr__( 'Video', 'auvyx-builder' ) );
	} elseif ( preg_match( '~vimeo\.com/(?:video/)?(\d{5,12})~', $auvyx_builder_src, $auvyx_builder_m ) ) {
		$auvyx_builder_media = sprintf( '<iframe src="%s" title="%s" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>', esc_url( 'https://player.vimeo.com/video/' . $auvyx_builder_m[1] . '?autoplay=1&muted=1&playsinline=1' ), esc_attr__( 'Video', 'auvyx-builder' ) );
	} elseif ( preg_match( '~^https?://[^\s"\'<>]+\.(?:mp4|webm|ogv)(?:\?[^\s"\'<>]*)?$~i', $auvyx_builder_src ) ) {
		$auvyx_builder_media = sprintf( '<video src="%s" autoplay muted playsinline controls preload="metadata"></video>', esc_url( $auvyx_builder_src ) );
	} else {
		return;
	}
	printf( '<div %s data-auvyx-autoplay="1">%s</div>', get_block_wrapper_attributes(), $auvyx_builder_media ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above and by core.
	return;
}
// A video file is a player of its own.
if ( preg_match( '~^https?://[^\s"\'<>]+\.(?:mp4|webm|ogv)(?:\?[^\s"\'<>]*)?$~i', trim( $auvyx_builder_url ) ) ) {
	printf( '<div %s><video src="%s" controls playsinline preload="metadata"></video></div>', get_block_wrapper_attributes(), esc_url( trim( $auvyx_builder_url ) ) ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
	return;
}
$auvyx_builder_embed = '';
if ( preg_match( '~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,20})~', $auvyx_builder_url, $auvyx_builder_m ) ) {
	$auvyx_builder_embed = 'https://www.youtube-nocookie.com/embed/' . $auvyx_builder_m[1];
} elseif ( preg_match( '~vimeo\.com/(?:video/)?(\d{5,12})~', $auvyx_builder_url, $auvyx_builder_m ) ) {
	$auvyx_builder_embed = 'https://player.vimeo.com/video/' . $auvyx_builder_m[1];
}
if ( '' === $auvyx_builder_embed ) {
	return;
}
printf(
	'<div %s><iframe src="%s" title="%s" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>',
	get_block_wrapper_attributes(), // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
	esc_url( $auvyx_builder_embed ),
	esc_attr__( 'Video', 'auvyx-builder' )
);
