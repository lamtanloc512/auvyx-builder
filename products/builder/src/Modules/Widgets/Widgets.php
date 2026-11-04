<?php
/**
 * Everyday widgets (shared/Widgets.scala), the ones page builders are judged by:
 *
 * - Auvyx elements with a marker class, finished by assets/widgets.js where the page has one: counter (`auvyx-counter`) and
 *   progress bar (`auvyx-progress`). Without the script each still reads correctly. Auvyx Builder Pro adds its own (ProWidgets).
 * - Two dynamic blocks the server renders, so they need nothing in the saved HTML: `auvyx/map` (a Google Maps embed by
 *   address, no API key, lazy) and `auvyx/breadcrumbs` (the trail to the page, with BreadcrumbList structured data).
 *   Auvyx Studio edits their attributes with its generic block controls and previews the server's HTML.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Widgets;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class Widgets implements Module {

	public const HANDLE  = 'auvyx-widgets';
	public const MARKERS = array( 'auvyx-counter', 'auvyx-progress' );
	/** Blocks of this module Auvyx Studio offers (Studio::block_types). */
	public const BLOCKS = array( 'auvyx/map', 'auvyx/breadcrumbs' );

	public function id(): string {
		return 'widgets';
	}

	public function requires(): array {
		return array( 'wp' => '6.7' );
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_action( 'init', array( $this, 'register_blocks' ) );
		foreach ( array( 'auvyx/section', 'auvyx/text', 'auvyx/heading' ) as $block ) {
			add_filter( 'render_block_' . $block, array( $this, 'render' ), 10, 2 );
		}
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/widgets.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
	}

	/**
	 * Whether these classes carry one of the markers.
	 *
	 * @param string[] $markers Markers (default: this module's).
	 */
	public static function has_marker( string $classes, array $markers = self::MARKERS ): bool {
		return (bool) array_intersect( $markers, preg_split( '/\s+/', trim( $classes ) ) );
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render( $html, $block ): string {
		if ( self::has_marker( (string) ( $block['attrs']['className'] ?? '' ) ) ) {
			wp_enqueue_script( self::HANDLE );
		}
		return (string) $html;
	}

	public function register_blocks(): void {
		$registry = \WP_Block_Type_Registry::get_instance();
		if ( ! $registry->is_registered( 'auvyx/map' ) ) {
			register_block_type(
				'auvyx/map',
				array(
					'title'           => __( 'Map', 'auvyx-builder' ),
					'description'     => __( 'A Google map of an address. No API key needed.', 'auvyx-builder' ),
					'category'        => 'auvyx-builder',
					'icon'            => 'location',
					'attributes'      => array(
						'address' => array(
							'type'    => 'string',
							'default' => '',
						),
						'zoom'    => array(
							'type'    => 'integer',
							'default' => 14,
						),
						'height'  => array(
							'type'    => 'integer',
							'default' => 360,
						),
					),
					'supports'        => array(
						'anchor'    => true,
						'className' => true,
					),
					'render_callback' => array( self::class, 'map' ),
				)
			);
		}
		if ( ! $registry->is_registered( 'auvyx/breadcrumbs' ) ) {
			register_block_type(
				'auvyx/breadcrumbs',
				array(
					'title'           => __( 'Breadcrumbs', 'auvyx-builder' ),
					'description'     => __( 'Where the visitor is: Home › Section › Page, with structured data for search engines.', 'auvyx-builder' ),
					'category'        => 'auvyx-builder',
					'icon'            => 'arrow-right-alt2',
					'attributes'      => array(
						'home'      => array(
							'type'    => 'string',
							'default' => '',
						),
						'separator' => array(
							'type'    => 'string',
							'enum'    => array( '›', '/', '→', '·' ),
							'default' => '›',
						),
					),
					'supports'        => array(
						'anchor'    => true,
						'className' => true,
					),
					'render_callback' => array( self::class, 'breadcrumbs' ),
				)
			);
		}
	}

	/**
	 * A Google Maps embed of the address (the public `output=embed` form, no key), loaded lazily, with a link for
	 * visitors without frames.
	 *
	 * @param array<string, mixed> $attributes Block attributes.
	 */
	public static function map( $attributes ): string {
		$attributes = is_array( $attributes ) ? $attributes : array();
		$address    = is_string( $attributes['address'] ?? null ) ? trim( wp_strip_all_tags( $attributes['address'] ) ) : '';
		if ( '' === $address ) {
			$address = (string) get_bloginfo( 'name' );
		}
		$address = mb_substr( $address, 0, 200 );
		$zoom    = max( 1, min( 21, (int) ( $attributes['zoom'] ?? 14 ) ) );
		$height  = max( 160, min( 1200, (int) ( $attributes['height'] ?? 360 ) ) );
		$src     = 'https://maps.google.com/maps?' . http_build_query(
			array(
				'q'      => $address,
				'z'      => $zoom,
				'output' => 'embed',
			),
			'',
			'&amp;',
			PHP_QUERY_RFC3986
		);
		$link    = 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode( $address );
		$wrapper = get_block_wrapper_attributes( array( 'class' => 'auvyx-map' ) );
		return sprintf(
			'<div %1$s><iframe src="%2$s" title="%3$s" style="height:%4$dpx" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe><noscript><a href="%5$s">%6$s</a></noscript></div>',
			$wrapper,
			$src, // Built above from encoded parts.
			/* translators: %s: address */
			esc_attr( sprintf( __( 'Map of %s', 'auvyx-builder' ), $address ) ),
			$height,
			esc_url( $link ),
			esc_html( $address )
		);
	}

	/**
	 * The trail to the current page: the home page, then the parents (pages), the post type's archive or the first
	 * category (posts, products), then the page itself (not a link). Also printed as schema.org BreadcrumbList.
	 *
	 * @return array<int, array{0: string, 1: string}> Label and address of each step; the last has no address.
	 */
	public static function trail( string $home_label = '' ): array {
		$trail = array( array( '' !== $home_label ? $home_label : __( 'Home', 'auvyx-builder' ), home_url( '/' ) ) );
		if ( is_front_page() ) {
			return array( array( $trail[0][0], '' ) );
		}
		if ( is_singular() ) {
			$post = get_queried_object();
			if ( ! $post instanceof \WP_Post ) {
				return $trail;
			}
			if ( is_post_type_hierarchical( $post->post_type ) ) {
				foreach ( array_reverse( get_post_ancestors( $post ) ) as $parent ) {
					$trail[] = array( get_the_title( $parent ), (string) get_permalink( $parent ) );
				}
			} else {
				$archive = 'post' === $post->post_type ? ( (int) get_option( 'page_for_posts' ) ? (string) get_permalink( (int) get_option( 'page_for_posts' ) ) : '' ) : (string) get_post_type_archive_link( $post->post_type );
				if ( '' !== $archive ) {
					$type    = get_post_type_object( $post->post_type );
					$label   = 'post' === $post->post_type ? get_the_title( (int) get_option( 'page_for_posts' ) ) : ( $type ? $type->labels->name : '' );
					$trail[] = array( (string) $label, $archive );
				}
				$taxonomy = 'product' === $post->post_type ? 'product_cat' : 'category';
				$terms    = taxonomy_exists( $taxonomy ) ? get_the_terms( $post, $taxonomy ) : false;
				if ( is_array( $terms ) && $terms ) {
					$term = $terms[0];
					foreach ( array_reverse( get_ancestors( $term->term_id, $taxonomy, 'taxonomy' ) ) as $ancestor ) {
						$a = get_term( $ancestor, $taxonomy );
						if ( $a instanceof \WP_Term ) {
							$trail[] = array( $a->name, (string) get_term_link( $a ) );
						}
					}
					$link    = get_term_link( $term );
					$trail[] = array( $term->name, is_wp_error( $link ) ? '' : $link );
				}
			}
			$trail[] = array( get_the_title( $post ), '' );
		} elseif ( is_category() || is_tag() || is_tax() ) {
			$term = get_queried_object();
			if ( $term instanceof \WP_Term ) {
				foreach ( array_reverse( get_ancestors( $term->term_id, $term->taxonomy, 'taxonomy' ) ) as $ancestor ) {
					$a = get_term( $ancestor, $term->taxonomy );
					if ( $a instanceof \WP_Term ) {
						$trail[] = array( $a->name, (string) get_term_link( $a ) );
					}
				}
				$trail[] = array( $term->name, '' );
			}
		} elseif ( is_post_type_archive() ) {
			$trail[] = array( (string) post_type_archive_title( '', false ), '' );
		} elseif ( is_home() ) {
			$trail[] = array( get_the_title( (int) get_option( 'page_for_posts' ) ), '' );
		} elseif ( is_search() ) {
			/* translators: %s: search terms */
			$trail[] = array( sprintf( __( 'Search: %s', 'auvyx-builder' ), get_search_query() ), '' );
		} elseif ( is_404() ) {
			$trail[] = array( __( 'Page not found', 'auvyx-builder' ), '' );
		} elseif ( is_author() ) {
			$trail[] = array( (string) get_the_author_meta( 'display_name', (int) get_query_var( 'author' ) ), '' );
		} elseif ( is_date() ) {
			$trail[] = array( (string) get_the_archive_title(), '' );
		}
		return $trail;
	}

	/**
	 * @param array<string, mixed> $attributes Block attributes.
	 */
	public static function breadcrumbs( $attributes ): string {
		$attributes = is_array( $attributes ) ? $attributes : array();
		$home       = is_string( $attributes['home'] ?? null ) ? mb_substr( trim( $attributes['home'] ), 0, 60 ) : '';
		$separator  = in_array( $attributes['separator'] ?? '›', array( '›', '/', '→', '·' ), true ) ? $attributes['separator'] : '›';
		$trail      = self::trail( $home );
		$items      = '';
		$data       = array();
		$last       = count( $trail ) - 1;
		foreach ( $trail as $i => $step ) {
			list( $label, $url ) = $step;
			$items              .= $i === $last || '' === $url
				? sprintf( '<li><span aria-current="page">%s</span></li>', esc_html( $label ) )
				: sprintf( '<li><a href="%1$s">%2$s</a><span class="auvyx-breadcrumbs__sep" aria-hidden="true">%3$s</span></li>', esc_url( $url ), esc_html( $label ), esc_html( $separator ) );
			$data[]              = array_filter(
				array(
					'@type'    => 'ListItem',
					'position' => $i + 1,
					'name'     => wp_strip_all_tags( $label ),
					'item'     => '' !== $url ? $url : null,
				)
			);
		}
		$json = wp_json_encode(
			array(
				'@context'        => 'https://schema.org',
				'@type'           => 'BreadcrumbList',
				'itemListElement' => $data,
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP
		);
		return sprintf(
			'<nav %1$s aria-label="%2$s"><ol>%3$s</ol><script type="application/ld+json">%4$s</script></nav>',
			get_block_wrapper_attributes( array( 'class' => 'auvyx-breadcrumbs' ) ),
			esc_attr__( 'Breadcrumb', 'auvyx-builder' ),
			$items,
			$json
		);
	}
}
