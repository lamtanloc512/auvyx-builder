<?php
/**
 * The site's own patterns and components (WordPress `wp_block` posts): patterns are copied where they are inserted
 * (`wp_pattern_sync_status` = unsynced), components stay one shared piece (synced). Auvyx Studio lists them to insert,
 * saves a selection as either, and the menu builder puts one in a mega menu panel.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

defined( 'ABSPATH' ) || exit;

final class Library {

	const SYNC = 'wp_pattern_sync_status';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			'auvyx/v1',
			'/library',
			array(
				array(
					'methods'             => 'GET',
					'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
					'callback'            => static fn() => new \WP_REST_Response( self::all() ),
				),
				array(
					'methods'             => 'POST',
					'permission_callback' => static fn() => current_user_can( get_post_type_object( 'wp_block' )->cap->create_posts ),
					'callback'            => array( self::class, 'rest_create' ),
					'args'                => array(
						'title'  => array(
							'type'     => 'string',
							'required' => true,
						),
						'markup' => array(
							'type'     => 'string',
							'required' => true,
						),
					),
				),
			)
		);
	}

	public static function synced( int $id ): bool {
		return 'unsynced' !== get_post_meta( $id, self::SYNC, true );
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function item( \WP_Post $post ): array {
		$terms = get_the_terms( $post, 'wp_pattern_category' );
		return array(
			'id'       => (int) $post->ID,
			'title'    => '' !== $post->post_title ? $post->post_title : __( '(untitled)', 'auvyx-builder' ),
			'synced'   => self::synced( (int) $post->ID ),
			'category' => is_array( $terms ) && $terms ? $terms[0]->name : '',
			'editUrl'  => Studio::url( (int) $post->ID ),
		);
	}

	/** @return array<int, array<string, mixed>> */
	public static function all(): array {
		return array_map(
			array( self::class, 'item' ),
			get_posts(
				array(
					'post_type'      => 'wp_block',
					'post_status'    => array( 'publish', 'draft' ),
					'posts_per_page' => 200,
					'orderby'        => 'title',
					'order'          => 'ASC',
				)
			)
		);
	}

	/**
	 * Creates a pattern (synced false) or a component from block markup.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_create( $request ) {
		$id = self::create( (string) $request['title'], (string) $request['markup'], (bool) $request->get_param( 'synced' ), (string) $request->get_param( 'category' ) );
		return is_wp_error( $id ) ? $id : new \WP_REST_Response( self::item( get_post( $id ) ) );
	}

	/**
	 * @return int|\WP_Error
	 */
	public static function create( string $title, string $markup, bool $synced, string $category = '' ) {
		$id = wp_insert_post(
			array(
				'post_type'    => 'wp_block',
				'post_status'  => current_user_can( get_post_type_object( 'wp_block' )->cap->publish_posts ) ? 'publish' : 'draft',
				'post_title'   => '' !== trim( $title ) ? sanitize_text_field( $title ) : __( 'Untitled pattern', 'auvyx-builder' ),
				// Slashed: wp_insert_post unslashes, which would eat the JSON escapes of block comments.
				'post_content' => wp_slash( $markup ),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		if ( ! $synced ) {
			update_post_meta( $id, self::SYNC, 'unsynced' );
		}
		if ( '' !== trim( $category ) && taxonomy_exists( 'wp_pattern_category' ) ) {
			wp_set_object_terms( $id, sanitize_text_field( $category ), 'wp_pattern_category' );
		}
		return (int) $id;
	}

	/**
	 * A pattern's blocks, for inserting a copy; null for components (they stay a reference) and unknown ids.
	 *
	 * @return array<int, array<string, mixed>>|null
	 */
	public static function pattern_blocks( int $id ): ?array {
		$post = get_post( $id );
		if ( ! $post || 'wp_block' !== $post->post_type || self::synced( $id ) || ! current_user_can( 'read_post', $id ) ) {
			return null;
		}
		return parse_blocks( $post->post_content );
	}
}
