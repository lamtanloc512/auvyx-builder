<?php
/**
 * REST for the Studio (WpHost's WpContentTypes): `auvyx/v1/content-types` (the definition) and
 * `auvyx/v1/content-types/<type>/entries[/<id>]` (entries as ContentTypes.scala's Entry JSON).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\ContentTypes;

defined( 'ABSPATH' ) || exit;

final class Rest {

	const PER_PAGE = 20;
	const TYPE     = '(?P<type>[a-z][a-z0-9_]{0,19})';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			'auvyx/v1',
			'/content-types',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_definition' ),
					'permission_callback' => static fn() => current_user_can( 'edit_posts' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'save_definition' ),
					'permission_callback' => static fn() => current_user_can( 'manage_options' ),
					'args'                => array(
						'definition' => array(
							'description' => __( 'The whole definition (auvyx-content/1).', 'auvyx-builder' ),
							'required'    => true,
						),
					),
				),
			)
		);
		$type_arg = array(
			'type' => array(
				'type'    => 'string',
				'pattern' => '^[a-z][a-z0-9_]{0,19}$',
			),
		);
		$entry    = array(
			'title'   => array( 'type' => 'string' ),
			'status'  => array(
				'type' => 'string',
				'enum' => array( 'publish', 'draft' ),
			),
			'content' => array( 'type' => 'string' ),
			'excerpt' => array( 'type' => 'string' ),
			'image'   => array( 'type' => 'string' ),
			'values'  => array( 'type' => array( 'object', 'array' ) ),
			'terms'   => array( 'type' => array( 'object', 'array' ) ),
		);
		register_rest_route(
			'auvyx/v1',
			'/content-types/' . self::TYPE . '/entries',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_entries' ),
					'permission_callback' => array( $this, 'can_list' ),
					'args'                => $type_arg + array(
						'search' => array(
							'type'              => 'string',
							'default'           => '',
							'sanitize_callback' => 'sanitize_text_field',
						),
						'page'   => array(
							'type'    => 'integer',
							'default' => 1,
							'minimum' => 1,
						),
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'save_entry' ),
					'permission_callback' => array( $this, 'can_create' ),
					'args'                => $type_arg + $entry,
				),
			)
		);
		// The id comes from the address only (an Entry's JSON carries its own `id`, which is never trusted).
		$id_arg = $type_arg;
		register_rest_route(
			'auvyx/v1',
			'/content-types/' . self::TYPE . '/entries/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_entry' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => $id_arg,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'save_entry' ),
					'permission_callback' => array( $this, 'can_edit' ),
					'args'                => $id_arg + $entry,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_entry' ),
					'permission_callback' => array( $this, 'can_delete' ),
					'args'                => $id_arg,
				),
			)
		);
	}

	// ---- permissions -------------------------------------------------------------------------------

	/**
	 * The post type object of a request's type, when it is one of ours and registered.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	private static function post_type( $request ): ?\WP_Post_Type {
		$key = (string) ( $request->get_url_params()['type'] ?? '' );
		return null !== ContentTypes::type( $key ) ? get_post_type_object( $key ) : null;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 */
	public function can_list( $request ): bool {
		$type = self::post_type( $request );
		return $type ? current_user_can( $type->cap->edit_posts ) : current_user_can( 'edit_posts' );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 */
	public function can_create( $request ): bool {
		$type = self::post_type( $request );
		return $type ? current_user_can( $type->cap->create_posts ) : current_user_can( 'edit_posts' );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 */
	public function can_edit( $request ): bool {
		return current_user_can( 'edit_post', self::id( $request ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 */
	public function can_delete( $request ): bool {
		return current_user_can( 'delete_post', self::id( $request ) );
	}

	/**
	 * The entry id in the address (0 when creating).
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	private static function id( $request ): int {
		$params = $request->get_url_params();
		return isset( $params['id'] ) ? (int) $params['id'] : 0;
	}

	// ---- the definition --------------------------------------------------------------------------

	public function get_definition(): \WP_REST_Response {
		return new \WP_REST_Response( array( 'definition' => Model::to_json( ContentTypes::definition() ) ) );
	}

	/**
	 * Saves the whole definition, or refuses it with every error.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_definition( $request ) {
		// Decoded with objects kept apart from lists (`{}` is not `[]`), as the Studio checks it.
		$body   = json_decode( (string) $request->get_body(), false );
		$json   = $body instanceof \stdClass && property_exists( $body, 'definition' ) ? $body->definition : $request->get_param( 'definition' );
		$result = ContentTypes::save( $json );
		if ( null === $result['definition'] ) {
			return self::invalid( $result['errors'] );
		}
		return new \WP_REST_Response( array( 'definition' => Model::to_json( $result['definition'] ) ) );
	}

	/**
	 * @param array<int, string> $errors Errors.
	 */
	private static function invalid( array $errors ): \WP_Error {
		return new \WP_Error(
			'invalid',
			implode( '; ', $errors ),
			array(
				'status' => 400,
				'errors' => $errors,
			)
		);
	}

	// ---- entries ---------------------------------------------------------------------------------

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function list_entries( $request ) {
		$type = ContentTypes::type( (string) ( $request->get_url_params()['type'] ?? '' ) );
		$pt   = self::post_type( $request );
		if ( null === $type || null === $pt ) {
			return new \WP_Error( 'not_found', __( 'No such content type.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		$args   = array(
			'post_type'      => $type['key'],
			'post_status'    => array( 'publish', 'draft', 'pending', 'future', 'private' ),
			'posts_per_page' => self::PER_PAGE,
			'paged'          => max( 1, (int) $request['page'] ),
			'orderby'        => 'date',
			'order'          => 'DESC',
		);
		$search = (string) $request['search'];
		if ( '' !== $search ) {
			$args['s'] = $search;
		}
		if ( ! current_user_can( $pt->cap->edit_others_posts ) ) {
			$args['author'] = get_current_user_id();
		}
		$query = new \WP_Query( $args );
		$items = array();
		foreach ( $query->posts as $post ) {
			if ( $post instanceof \WP_Post && current_user_can( 'edit_post', $post->ID ) ) {
				$items[] = self::entry( $post, $type );
			}
		}
		return new \WP_REST_Response(
			array(
				'items' => $items,
				'total' => (int) $query->found_posts,
				'pages' => max( 1, (int) $query->max_num_pages ),
			)
		);
	}

	/**
	 * The entry of a request, when it is of the request's type.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array{0: \WP_Post, 1: array<string, mixed>}|\WP_Error
	 */
	private static function requested_entry( $request ) {
		$type = ContentTypes::type( (string) ( $request->get_url_params()['type'] ?? '' ) );
		$post = get_post( self::id( $request ) );
		if ( null === $type || ! $post || $post->post_type !== $type['key'] || 'trash' === $post->post_status ) {
			return new \WP_Error( 'not_found', __( 'No such entry.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		return array( $post, $type );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_entry( $request ) {
		$found = self::requested_entry( $request );
		return is_wp_error( $found ) ? $found : new \WP_REST_Response( self::entry( $found[0], $found[1] ) );
	}

	/**
	 * Creates or updates an entry. Every value is checked first: one refused value refuses the entry, nothing is saved.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_entry( $request ) {
		$id = self::id( $request );
		if ( $id > 0 ) {
			$found = self::requested_entry( $request );
			if ( is_wp_error( $found ) ) {
				return $found;
			}
			list( $post, $type ) = $found;
		} else {
			$post = null;
			$type = ContentTypes::type( (string) ( $request->get_url_params()['type'] ?? '' ) );
		}
		$pt = self::post_type( $request );
		if ( null === $type || null === $pt ) {
			return new \WP_Error( 'not_found', __( 'No such content type.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		$body   = (array) $request->get_json_params() + (array) $request->get_body_params();
		$status = isset( $body['status'] ) && '' !== $body['status'] ? (string) $body['status'] : ( $post ? ( 'publish' === $post->post_status ? 'publish' : 'draft' ) : 'publish' );
		if ( 'publish' !== $status && 'draft' !== $status ) {
			return self::invalid( array( 'status: publish or draft' ) );
		}
		if ( 'publish' === $status && ( ! $post || 'publish' !== $post->post_status ) && ! current_user_can( $pt->cap->publish_posts ) ) {
			return new \WP_Error( 'rest_cannot_publish', __( 'Sorry, you are not allowed to publish these entries.', 'auvyx-builder' ), array( 'status' => 403 ) );
		}
		$values = null;
		if ( array_key_exists( 'values', $body ) || ! $post ) {
			$raw    = $body['values'] ?? array();
			$result = Model::sanitize_all( $type, is_array( $raw ) ? $raw : array() );
			if ( array() !== $result['errors'] ) {
				return self::invalid( $result['errors'] );
			}
			$values = $result['values'];
		}
		$data = array(
			'post_type'   => $type['key'],
			'post_status' => $status,
		);
		if ( $post ) {
			$data['ID'] = $post->ID;
		}
		if ( array_key_exists( 'title', $body ) || ! $post ) {
			$data['post_title'] = sanitize_text_field( (string) ( $body['title'] ?? '' ) );
		}
		if ( array_key_exists( 'content', $body ) ) {
			$data['post_content'] = wp_kses_post( (string) $body['content'] );
		}
		if ( array_key_exists( 'excerpt', $body ) ) {
			$data['post_excerpt'] = sanitize_textarea_field( (string) $body['excerpt'] );
		}
		$saved = $post ? wp_update_post( wp_slash( $data ), true ) : wp_insert_post( wp_slash( $data ), true );
		if ( is_wp_error( $saved ) ) {
			return new \WP_Error( 'save_failed', $saved->get_error_message(), array( 'status' => 500 ) );
		}
		$post_id = (int) $saved;
		if ( null !== $values ) {
			ContentTypes::store( $post_id, $type, $values );
		}
		if ( array_key_exists( 'image', $body ) ) {
			self::set_image( $post_id, (string) $body['image'] );
		}
		if ( isset( $body['terms'] ) && is_array( $body['terms'] ) ) {
			self::set_terms( $post_id, $type, $body['terms'] );
		}
		return new \WP_REST_Response( self::entry( get_post( $post_id ), $type ), $post ? 200 : 201 );
	}

	/** The featured image from an address: only a media file of this site; anything else is ignored. */
	private static function set_image( int $post_id, string $url ): void {
		if ( '' === trim( $url ) ) {
			delete_post_thumbnail( $post_id );
			return;
		}
		$attachment = attachment_url_to_postid( esc_url_raw( $url ) );
		if ( $attachment > 0 && 'attachment' === get_post_type( $attachment ) && wp_attachment_is_image( $attachment ) ) {
			set_post_thumbnail( $post_id, $attachment );
		}
	}

	/**
	 * Terms by name, for the type's taxonomies. Missing terms are created only for users who may manage them.
	 *
	 * @param array<string, mixed> $type  Type.
	 * @param array<string, mixed> $terms Names by taxonomy.
	 */
	private static function set_terms( int $post_id, array $type, array $terms ): void {
		foreach ( ContentTypes::taxonomies_of( $type['key'] ) as $taxonomy ) {
			$tax = get_taxonomy( $taxonomy['key'] );
			if ( ! $tax || ! array_key_exists( $taxonomy['key'], $terms ) || ! current_user_can( $tax->cap->assign_terms ) ) {
				continue;
			}
			$ids = array();
			foreach ( array_slice( (array) $terms[ $taxonomy['key'] ], 0, 50 ) as $name ) {
				$name = sanitize_text_field( is_scalar( $name ) ? (string) $name : '' );
				if ( '' === $name ) {
					continue;
				}
				$found = term_exists( $name, $taxonomy['key'] );
				if ( ! $found && current_user_can( $tax->cap->manage_terms ) ) {
					$found = wp_insert_term( wp_slash( $name ), $taxonomy['key'] );
				}
				if ( is_array( $found ) && isset( $found['term_id'] ) ) {
					$ids[] = (int) $found['term_id'];
				}
			}
			wp_set_object_terms( $post_id, $ids, $taxonomy['key'] );
		}
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function delete_entry( $request ) {
		$found = self::requested_entry( $request );
		if ( is_wp_error( $found ) ) {
			return $found;
		}
		if ( ! wp_trash_post( $found[0]->ID ) ) {
			return new \WP_Error( 'trash_failed', __( 'The entry could not be moved to the trash.', 'auvyx-builder' ), array( 'status' => 500 ) );
		}
		return new \WP_REST_Response( array( 'trashed' => true ) );
	}

	/**
	 * An entry as the Studio reads it.
	 *
	 * @param array<string, mixed> $type Type.
	 * @return array<string, mixed>
	 */
	public static function entry( \WP_Post $post, array $type ): array {
		$terms = array();
		foreach ( ContentTypes::taxonomies_of( $type['key'] ) as $taxonomy ) {
			$found                     = get_the_terms( $post, $taxonomy['key'] );
			$terms[ $taxonomy['key'] ] = is_array( $found ) ? array_values( wp_list_pluck( $found, 'name' ) ) : array();
		}
		return array(
			'id'      => (string) $post->ID,
			'title'   => $post->post_title,
			'status'  => 'publish' === $post->post_status ? 'publish' : 'draft',
			'content' => $post->post_content,
			'excerpt' => $post->post_excerpt,
			'image'   => (string) get_the_post_thumbnail_url( $post, 'full' ),
			'values'  => (object) ContentTypes::values( $post->ID, $type ),
			'terms'   => (object) $terms,
			'url'     => (string) get_permalink( $post ),
			'editUrl' => (string) get_edit_post_link( $post->ID, 'raw' ),
		);
	}
}
