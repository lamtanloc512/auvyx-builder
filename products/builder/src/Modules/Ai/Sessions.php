<?php
/**
 * The Studio agent's conversations, kept per user and document (ADR 0039).
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Ai;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

/**
 * A conversation is a private post: author = the user, parent = the edited document, content = the agent's transcript
 * (JSON, opaque here). Only its author sees it, on a document they may edit. The oldest go past a limit per document.
 */
final class Sessions implements Module {

	const POST_TYPE = 'auvyx_agent_session';
	const ROUTE     = '/ai/sessions';

	/** Conversations kept per user and document. */
	const KEEP = 20;

	/** Largest transcript stored (bytes). */
	const MAX_BYTES = 2000000;

	public function id(): string {
		return 'ai-sessions';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_type' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest' ) );
		add_action( 'deleted_post', array( $this, 'forget_document' ) );
	}

	/**
	 * A deleted document takes its conversations with it.
	 *
	 * @param int $document Deleted post id.
	 */
	public function forget_document( $document ): void {
		$ids = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'post_parent'    => (int) $document,
				'fields'         => 'ids',
				'posts_per_page' => -1,
			)
		);
		foreach ( $ids as $id ) {
			wp_delete_post( (int) $id, true );
		}
	}

	public function register_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'label'           => __( 'AI conversations', 'auvyx-builder' ),
				'public'          => false,
				'show_ui'         => false,
				'show_in_rest'    => false,
				'rewrite'         => false,
				'query_var'       => false,
				'supports'        => array( 'title', 'editor', 'author' ),
				'capability_type' => 'post',
			)
		);
	}

	public function register_rest(): void {
		$can = static fn() => current_user_can( 'edit_posts' );
		register_rest_route(
			'auvyx/v1',
			self::ROUTE,
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_list' ),
					'permission_callback' => $can,
					'args'                => array(
						'document' => array(
							'type'     => 'integer',
							'required' => true,
						),
					),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_save' ),
					'permission_callback' => $can,
					'args'                => array(
						'document'   => array(
							'type'     => 'integer',
							'required' => true,
						),
						'id'         => array( 'type' => 'integer' ),
						'title'      => array( 'type' => 'string' ),
						'transcript' => array(
							'type'     => 'string',
							'required' => true,
						),
					),
				),
			)
		);
		register_rest_route(
			'auvyx/v1',
			self::ROUTE . '/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get' ),
					'permission_callback' => $can,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'rest_delete' ),
					'permission_callback' => $can,
				),
			)
		);
	}

	/** The user may keep conversations on this document: they may edit it. */
	private static function document_ok( int $document ): bool {
		return $document > 0 && null !== get_post( $document ) && current_user_can( 'edit_post', $document );
	}

	/**
	 * The current user's conversation, or null.
	 *
	 * @param int $id Conversation id.
	 */
	private static function own( int $id ): ?\WP_Post {
		$post = get_post( $id );
		return $post && self::POST_TYPE === $post->post_type && get_current_user_id() === (int) $post->post_author ? $post : null;
	}

	/**
	 * Conversations of the current user on a document, newest first.
	 *
	 * @param int $document Document id.
	 * @return \WP_Post[]
	 */
	public static function of( int $document ): array {
		return get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'private',
				'post_parent'    => $document,
				'author'         => get_current_user_id(),
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'posts_per_page' => 100,
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_list( $request ) {
		$document = (int) $request['document'];
		if ( ! self::document_ok( $document ) ) {
			return new \WP_Error( 'auvyx_forbidden', __( 'You cannot edit this document.', 'auvyx-builder' ), array( 'status' => 403 ) );
		}
		return rest_ensure_response(
			array_map(
				static fn( \WP_Post $p ) => array(
					'id'      => (string) $p->ID,
					'title'   => $p->post_title,
					'updated' => (float) get_post_modified_time( 'U', true, $p ) * 1000,
				),
				self::of( $document )
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_get( $request ) {
		$post = self::own( (int) $request['id'] );
		if ( ! $post ) {
			return new \WP_Error( 'auvyx_not_found', __( 'No such conversation.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response( array( 'transcript' => $post->post_content ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_save( $request ) {
		$document   = (int) $request['document'];
		$transcript = (string) $request['transcript'];
		if ( ! self::document_ok( $document ) ) {
			return new \WP_Error( 'auvyx_forbidden', __( 'You cannot edit this document.', 'auvyx-builder' ), array( 'status' => 403 ) );
		}
		if ( strlen( $transcript ) > self::MAX_BYTES || null === json_decode( $transcript ) ) {
			return new \WP_Error( 'auvyx_bad_transcript', __( 'The conversation is too long or not JSON.', 'auvyx-builder' ), array( 'status' => 400 ) );
		}
		$fields = array(
			'post_type'    => self::POST_TYPE,
			'post_status'  => 'private',
			'post_parent'  => $document,
			'post_title'   => sanitize_text_field( (string) ( $request['title'] ?? '' ) ),
			// Slashed: wp_insert_post unslashes, which would eat the JSON's escapes.
			'post_content' => wp_slash( $transcript ),
		);
		$id     = (int) ( $request['id'] ?? 0 );
		if ( $id > 0 ) {
			if ( ! self::own( $id ) ) {
				return new \WP_Error( 'auvyx_not_found', __( 'No such conversation.', 'auvyx-builder' ), array( 'status' => 404 ) );
			}
			$fields['ID'] = $id;
			$result       = wp_update_post( $fields, true );
		} else {
			$fields['post_author'] = get_current_user_id();
			$result                = wp_insert_post( $fields, true );
		}
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		foreach ( array_slice( self::of( $document ), self::KEEP ) as $old ) {
			wp_delete_post( $old->ID, true );
		}
		return rest_ensure_response( array( 'id' => (string) $result ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_delete( $request ) {
		$post = self::own( (int) $request['id'] );
		if ( ! $post ) {
			return new \WP_Error( 'auvyx_not_found', __( 'No such conversation.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		wp_delete_post( $post->ID, true );
		return rest_ensure_response( array( 'deleted' => true ) );
	}
}
