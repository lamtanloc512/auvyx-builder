<?php
/**
 * Auvyx Posts loop: the inner blocks are a template rendered once per post of the query, with `postId` / `postType`
 * context, so Auvyx elements bound to `auvyx/data` fields show that post (Modules/Data). With `inherit` on archives and the
 * blog page, it shows the page's own posts.
 *
 * @package Auvyx\Builder
 * @var array<string, mixed> $attributes
 * @var WP_Block             $block
 */

use Auvyx\Builder\Modules\Data\Data;

defined( 'ABSPATH' ) || exit;

$auvyx_builder_q = isset( $attributes['query'] ) && is_array( $attributes['query'] ) ? $attributes['query'] : array();

// A data source (`data/<name>`, Modules/DataSources): its items, each the `auvyx/item` context of the card template.
$auvyx_builder_data = \Auvyx\Builder\Modules\DataSources\DataSources::source_name( (string) ( $auvyx_builder_q['source'] ?? '' ) );
if ( '' !== $auvyx_builder_data ) {
	$auvyx_builder_offset = max( 0, min( 100, (int) ( $auvyx_builder_q['offset'] ?? 0 ) ) );
	$auvyx_builder_rows   = array_slice( \Auvyx\Builder\Modules\DataSources\DataSources::items_for( $auvyx_builder_data ), $auvyx_builder_offset, max( 1, min( 50, (int) ( $auvyx_builder_q['perPage'] ?? 3 ) ) ) );
	$auvyx_builder_items  = '';
	foreach ( $auvyx_builder_rows as $auvyx_builder_row ) {
		foreach ( $block->parsed_block['innerBlocks'] as $auvyx_builder_inner ) {
			$auvyx_builder_items .= ( new WP_Block( $auvyx_builder_inner, array( 'auvyx/item' => $auvyx_builder_row ) ) )->render();
		}
	}
	$auvyx_builder_extra = ! empty( $attributes['anchor'] ) && is_string( $attributes['anchor'] ) ? array( 'id' => $attributes['anchor'] ) : array();
	printf(
		'<div %1$s>%2$s</div>',
		get_block_wrapper_attributes( $auvyx_builder_extra ), // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
		$auvyx_builder_items // phpcs:ignore WordPress.Security.EscapeOutput -- rendered blocks.
	);
	return;
}

if ( ! empty( $auvyx_builder_q['inherit'] ) && ( is_home() || is_archive() || is_search() ) ) {
	global $wp_query;
	// A copy: iterating the main query itself would rewind the loop this block may be rendered in.
	$auvyx_builder_query = clone $wp_query;
	$auvyx_builder_param = '';
} else {
	// Each paginated loop has its own page parameter, so two loops on one page page independently.
	$auvyx_builder_param = 'auvyxp' . substr( md5( (string) wp_json_encode( $auvyx_builder_q ) ), 0, 6 );
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a page number in a public URL.
	$auvyx_builder_page  = ! empty( $auvyx_builder_q['paginate'] ) && isset( $_GET[ $auvyx_builder_param ] ) ? min( 1000, max( 1, absint( $_GET[ $auvyx_builder_param ] ) ) ) : 1;
	$auvyx_builder_query = new WP_Query( Data::query_args( $auvyx_builder_q, ! empty( $auvyx_builder_q['excludeCurrent'] ) && is_singular() ? (int) get_queried_object_id() : 0, $auvyx_builder_page ) );
}

$auvyx_builder_items = '';
while ( $auvyx_builder_query->have_posts() ) {
	$auvyx_builder_query->the_post();
	$auvyx_builder_context = array(
		'postId'   => (int) get_the_ID(),
		'postType' => (string) get_post_type(),
	);
	foreach ( $block->parsed_block['innerBlocks'] as $auvyx_builder_inner ) {
		$auvyx_builder_items .= ( new WP_Block( $auvyx_builder_inner, $auvyx_builder_context ) )->render();
	}
}
wp_reset_postdata();

// Pagination: numbered links (page parameter of this loop, or the archive's own paging with `inherit`).
$auvyx_builder_pages = '';
// found_posts ignores the offset: count the pages without the skipped posts.
$auvyx_builder_per   = max( 1, (int) $auvyx_builder_query->get( 'posts_per_page' ) );
$auvyx_builder_skip  = '' === $auvyx_builder_param ? 0 : max( 0, min( 100, (int) ( $auvyx_builder_q['offset'] ?? 0 ) ) );
$auvyx_builder_total = '' === $auvyx_builder_param ? (int) $auvyx_builder_query->max_num_pages : (int) ceil( max( 0, (int) $auvyx_builder_query->found_posts - $auvyx_builder_skip ) / $auvyx_builder_per );
if ( ! empty( $auvyx_builder_q['paginate'] ) && $auvyx_builder_total > 1 ) {
	$auvyx_builder_links = '' === $auvyx_builder_param
		? paginate_links( array( 'type' => 'array' ) )
		: paginate_links(
			array(
				'type'    => 'array',
				'base'    => esc_url_raw( add_query_arg( $auvyx_builder_param, '%#%' ) ),
				'format'  => '',
				'current' => $auvyx_builder_page,
				'total'   => $auvyx_builder_total,
			)
		);
	if ( is_array( $auvyx_builder_links ) ) {
		$auvyx_builder_pages = '<nav class="auvyx-loop__pages" aria-label="' . esc_attr__( 'Pages', 'auvyx-builder' ) . '">' . implode( '', $auvyx_builder_links ) . '</nav>';
	}
}

$auvyx_builder_extra = array();
if ( ! empty( $attributes['anchor'] ) && is_string( $attributes['anchor'] ) ) {
	$auvyx_builder_extra['id'] = $attributes['anchor'];
}
// Load more / infinite scroll (Modules/LoopMore): the numbers above stay for visitors without JavaScript.
if ( ! empty( $auvyx_builder_q['paginate'] ) && class_exists( '\\Auvyx\\Builder\\Modules\\LoopMore\\LoopMore' ) ) {
	$auvyx_builder_extra += \Auvyx\Builder\Modules\LoopMore\LoopMore::attributes( (string) ( $auvyx_builder_q['more'] ?? '' ), '' === $auvyx_builder_param ? 'main' : $auvyx_builder_param );
}
printf(
	'<div %1$s>%2$s</div>%3$s',
	get_block_wrapper_attributes( $auvyx_builder_extra ), // phpcs:ignore WordPress.Security.EscapeOutput -- escaped by core.
	$auvyx_builder_items, // phpcs:ignore WordPress.Security.EscapeOutput -- rendered blocks.
	$auvyx_builder_pages // phpcs:ignore WordPress.Security.EscapeOutput -- paginate_links() output.
);
