<?php
/**
 * Auvyx Carousel: slides are data on the block, painted as a native scroll-snap strip. No JavaScript.
 *
 * @package Auvyx\Builder
 * @var array<string, mixed> $attributes
 */

defined( 'ABSPATH' ) || exit;

$auvyx_builder_q      = isset( $attributes['query'] ) && is_array( $attributes['query'] ) ? $attributes['query'] : array();
$auvyx_builder_layout = in_array( $auvyx_builder_q['layout'] ?? 'banner', array( 'banner', 'centered', 'split' ), true ) ? $auvyx_builder_q['layout'] : 'banner';
$auvyx_builder_size   = in_array( $auvyx_builder_q['size'] ?? 'full', array( 'full', 'half', 'third' ), true ) ? $auvyx_builder_q['size'] : 'full';
$auvyx_builder_height = in_array( $auvyx_builder_q['height'] ?? '480', array( '320', '480', '640' ), true ) ? $auvyx_builder_q['height'] : '480';
$auvyx_builder_gap    = isset( $auvyx_builder_q['gap'] ) && preg_match( '/^\d{1,3}px$/', (string) $auvyx_builder_q['gap'] ) ? (string) $auvyx_builder_q['gap'] : '0';
$auvyx_builder_basis  = array(
	'half'  => '50%',
	'third' => '33.333%',
	'full'  => '100%',
)[ $auvyx_builder_size ];
$auvyx_builder_raw    = json_decode( (string) ( $auvyx_builder_q['slides'] ?? '' ), true );
$auvyx_builder_slides = is_array( $auvyx_builder_raw ) ? array_slice( $auvyx_builder_raw, 0, 12 ) : array();

$auvyx_builder_items = '';
foreach ( $auvyx_builder_slides as $auvyx_builder_slide ) {
	if ( ! is_array( $auvyx_builder_slide ) ) {
		continue;
	}
	$auvyx_builder_raw_color = isset( $auvyx_builder_slide['color'] ) ? (string) $auvyx_builder_slide['color'] : '';
	$auvyx_builder_color     = preg_match( '/^(?:#[0-9a-fA-F]{6}|var\(--wp--preset--color--auvyx-[a-z0-9-]+\)|color-mix\(in srgb, var\(--wp--preset--color--auvyx-[a-z0-9-]+\) \d{1,3}%, var\(--wp--preset--color--auvyx-[a-z0-9-]+\)\))$/', $auvyx_builder_raw_color ) ? $auvyx_builder_raw_color : 'var(--wp--preset--color--auvyx-surface)';
	$auvyx_builder_on_hex    = 0 === strpos( $auvyx_builder_color, '#' );
	$auvyx_builder_image     = isset( $auvyx_builder_slide['image'] ) && preg_match( '#^(https?://|/).+#', (string) $auvyx_builder_slide['image'] ) ? (string) $auvyx_builder_slide['image'] : '';
	$auvyx_builder_href      = isset( $auvyx_builder_slide['href'] ) && preg_match( '#^(#|/|https?://)#', (string) $auvyx_builder_slide['href'] ) ? (string) $auvyx_builder_slide['href'] : '#';
	$auvyx_builder_align     = 'centered' === $auvyx_builder_layout ? 'center' : ( 'split' === $auvyx_builder_layout ? 'center' : 'flex-start' );
	$auvyx_builder_text      = 'centered' === $auvyx_builder_layout ? 'center' : 'left';
	$auvyx_builder_pad       = 'split' === $auvyx_builder_layout ? '52%' : '64px';
	$auvyx_builder_depth     = isset( $auvyx_builder_slide['depth'] ) ? max( 0, min( 100, (int) $auvyx_builder_slide['depth'] ) ) : 0;
	$auvyx_builder_dh        = isset( $auvyx_builder_slide['depthHover'] ) ? max( 0, min( 100, (int) $auvyx_builder_slide['depthHover'] ) ) : 0;
	$auvyx_builder_shift     = isset( $auvyx_builder_slide['parallax'] ) ? -0.4 * max( 0, min( 100, (int) $auvyx_builder_slide['parallax'] ) ) : 0;
	$auvyx_builder_px        = isset( $auvyx_builder_slide['posX'] ) ? max( 0, min( 100, (int) $auvyx_builder_slide['posX'] ) ) : 50;
	$auvyx_builder_py        = isset( $auvyx_builder_slide['posY'] ) ? max( 0, min( 100, (int) $auvyx_builder_slide['posY'] ) ) : 50;
	$auvyx_builder_hover     = in_array( $auvyx_builder_slide['hover'] ?? 'none', array( 'none', 'zoom', 'darken' ), true ) ? $auvyx_builder_slide['hover'] : 'none';
	$auvyx_builder_anim      = in_array( $auvyx_builder_slide['animate'] ?? 'none', array( 'fade', 'left', 'right', 'up' ), true ) ? ' auvyx-anim-' . $auvyx_builder_slide['animate'] : '';
	$auvyx_builder_ink       = $auvyx_builder_on_hex ? '#fff' : 'var(--wp--preset--color--auvyx-text)';
	$auvyx_builder_radius    = $auvyx_builder_on_hex ? '' : ';border-radius:var(--wp--custom--radius--md, 0)';
	$auvyx_builder_style     = sprintf(
		'position:relative;overflow:hidden;display:flex;flex-direction:column;gap:16px;justify-content:center;align-items:%1$s;text-align:%2$s;flex:0 0 %3$s;scroll-snap-align:start;min-width:0;min-height:%4$spx;padding:64px;padding-inline-end:%5$s;color:%6$s;background-color:%7$s%8$s',
		$auvyx_builder_align,
		$auvyx_builder_text,
		$auvyx_builder_basis,
		$auvyx_builder_height,
		$auvyx_builder_pad,
		$auvyx_builder_ink,
		$auvyx_builder_color,
		$auvyx_builder_radius
	);
	$auvyx_builder_picture   = '';
	if ( '' !== $auvyx_builder_image ) {
		$auvyx_builder_img     = sprintf(
			'<img class="auvyx-carousel__img auvyx-carousel__img--%1$s" src="%2$s" alt="%3$s" style="--auvyx-scale:%4$s;--auvyx-scale-hover:%5$s;--auvyx-shift:%6$spx;object-position:%7$d%% %8$d%%">',
			esc_attr( $auvyx_builder_hover ),
			esc_url( $auvyx_builder_image ),
			esc_attr( (string) ( $auvyx_builder_slide['alt'] ?? '' ) ),
			esc_attr( (string) ( 1 + $auvyx_builder_depth / 500 ) ),
			esc_attr( (string) ( 1 + ( $auvyx_builder_dh ? $auvyx_builder_dh : $auvyx_builder_depth ) / 500 ) ),
			esc_attr( (string) $auvyx_builder_shift ),
			$auvyx_builder_px,
			$auvyx_builder_py
		);
		$auvyx_builder_ilink   = isset( $auvyx_builder_slide['imageHref'] ) && preg_match( '#^(#|/|https?://)#', (string) $auvyx_builder_slide['imageHref'] ) ? (string) $auvyx_builder_slide['imageHref'] : '';
		$auvyx_builder_picture = '' === $auvyx_builder_ilink ? $auvyx_builder_img : '<a class="auvyx-carousel__imglink" href="' . esc_url( $auvyx_builder_ilink ) . '">' . $auvyx_builder_img . '</a>';
	}
	$auvyx_builder_inner = '';
	if ( ! empty( $auvyx_builder_slide['eyebrow'] ) ) {
		$auvyx_builder_inner .= '<p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">' . esc_html( (string) $auvyx_builder_slide['eyebrow'] ) . '</p>';
	}
	if ( ! empty( $auvyx_builder_slide['title'] ) ) {
		$auvyx_builder_inner .= '<h2 style="margin:0;font-size:40px;line-height:1.1">' . esc_html( (string) $auvyx_builder_slide['title'] ) . '</h2>';
	}
	if ( ! empty( $auvyx_builder_slide['body'] ) ) {
		$auvyx_builder_inner .= '<p style="margin:0;max-width:36rem">' . esc_html( (string) $auvyx_builder_slide['body'] ) . '</p>';
	}
	if ( ! empty( $auvyx_builder_slide['button'] ) ) {
		$auvyx_builder_btn_bg = $auvyx_builder_on_hex ? '#fff' : 'var(--wp--preset--color--auvyx-primary)';
		$auvyx_builder_btn_fg = $auvyx_builder_on_hex ? '#0f172a' : 'var(--wp--preset--color--auvyx-on-primary)';
		$auvyx_builder_inner .= '<a href="' . esc_url( $auvyx_builder_href ) . '" style="display:inline-block;margin-block-start:8px;padding:12px 20px;background:' . esc_attr( $auvyx_builder_btn_bg ) . ';color:' . esc_attr( $auvyx_builder_btn_fg ) . ';text-decoration:none;border-radius:var(--wp--custom--radius--md, 0)">' . esc_html( (string) $auvyx_builder_slide['button'] ) . '</a>';
	}
	$auvyx_builder_split  = 'split' === $auvyx_builder_layout ? ' auvyx-carousel__slide--split' : '';
	$auvyx_builder_items .= '<article class="auvyx-carousel__slide' . esc_attr( $auvyx_builder_anim . $auvyx_builder_split ) . '" style="' . esc_attr( $auvyx_builder_style ) . '">' . $auvyx_builder_picture . '<div class="auvyx-carousel__copy">' . $auvyx_builder_inner . '</div></article>';
}

printf(
	'<div %1$s><div class="auvyx-carousel__track" style="display:flex;gap:%2$s;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none">%3$s</div></div>',
	get_block_wrapper_attributes(), // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
	esc_attr( $auvyx_builder_gap ),
	$auvyx_builder_items // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above.
);
