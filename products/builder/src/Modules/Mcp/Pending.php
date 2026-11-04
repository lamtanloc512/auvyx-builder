<?php
/**
 * Code an AI proposed without the right to script (docs/mcp-v2.md, "Code waits"): the whole proposed save is kept aside
 * in the page's `auvyx_mcp_pending` meta and the page itself is untouched. The editors (Studio::config `mcpPending`) show
 * it; a signed-in person with unfiltered_html approves it (the save happens then, as them) or discards it, through
 * `POST auvyx/v1/mcp/pending/{id}` with the REST nonce. No Auvyx token can reach that route (McpAccess\Rules).
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Mcp;

use Auvyx\Builder\Modules\McpAccess\McpAccess;

defined( 'ABSPATH' ) || exit;

final class Pending {

	public const META = 'auvyx_mcp_pending';

	/** How much of each element's code the editors receive for review. */
	private const PREVIEW_BYTES = 20000;

	/**
	 * @param array<string, mixed> $save content, title, status, template, where, elements.
	 */
	public static function keep( \WP_Post $post, array $save ): void {
		$token = McpAccess::token();
		update_post_meta(
			$post->ID,
			self::META,
			wp_slash(
				array(
					'content'  => (string) $save['content'],
					'title'    => $save['title'],
					'status'   => (string) $save['status'],
					'template' => $save['template'],
					'where'    => (string) $save['where'],
					'elements' => array_values( array_map( 'strval', (array) $save['elements'] ) ),
					'token'    => null === $token ? '' : (string) $token['name'],
					'tokenId'  => null === $token ? '' : (string) $token['id'],
					'user'     => get_current_user_id(),
					'time'     => time(),
				)
			)
		);
	}

	/**
	 * @return array<string, mixed>|null
	 */
	public static function get( int $post_id ): ?array {
		$pending = get_post_meta( $post_id, self::META, true );
		return is_array( $pending ) && isset( $pending['content'] ) ? $pending : null;
	}

	/**
	 * What the editors show: who proposed what, when, and each waiting element's proposed code; null when nothing waits.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function config( \WP_Post $post ): ?array {
		$pending = self::get( $post->ID );
		if ( null === $pending || ! current_user_can( 'edit_post', $post->ID ) ) {
			return null;
		}
		$elements = array();
		$codes    = Writes::code_map( (string) $pending['content'] );
		$blocks   = array();
		self::index( parse_blocks( (string) $pending['content'] ), '', $blocks );
		foreach ( (array) $pending['elements'] as $path ) {
			$path       = (string) $path;
			$elements[] = array(
				'id'    => $path,
				'block' => isset( $blocks[ $path ] ) ? (string) $blocks[ $path ]['blockName'] : '',
				'code'  => isset( $codes[ $path ] ) ? substr( $codes[ $path ], 0, self::PREVIEW_BYTES ) : '',
				'html'  => isset( $blocks[ $path ] ) ? substr( (string) $blocks[ $path ]['innerHTML'], 0, self::PREVIEW_BYTES ) : '',
			);
		}
		return array(
			'token'      => (string) $pending['token'],
			'time'       => gmdate( 'c', (int) $pending['time'] ),
			'where'      => (string) $pending['where'],
			'title'      => null === $pending['title'] ? '' : (string) $pending['title'],
			'elements'   => $elements,
			'canApprove' => current_user_can( 'unfiltered_html' ),
			'route'      => Mcp::NS . '/mcp/pending/' . $post->ID,
			'nonce'      => wp_create_nonce( 'wp_rest' ),
		);
	}

	/**
	 * @param array<int, array<string, mixed>> $blocks Parsed blocks.
	 * @param array<string, array<string, mixed>> $out Path => block.
	 */
	private static function index( array $blocks, string $base, array &$out ): void {
		$i = 0;
		foreach ( $blocks as $block ) {
			if ( null === $block['blockName'] && '' === trim( (string) $block['innerHTML'] ) ) {
				continue;
			}
			$path         = '' === $base ? (string) $i : $base . '.' . $i;
			$out[ $path ] = $block;
			++$i;
			if ( ! empty( $block['innerBlocks'] ) ) {
				self::index( $block['innerBlocks'], $path, $out );
			}
		}
	}

	/**
	 * Only a signed-in person (REST nonce, never a token) who may script and edit this page decides.
	 */
	public static function permission( \WP_REST_Request $request ): bool {
		$nonce = (string) $request->get_header( 'X-WP-Nonce' );
		if ( '' === $nonce ) {
			$nonce = (string) $request->get_param( '_wpnonce' );
		}
		return ! McpAccess::active()
			&& false !== wp_verify_nonce( $nonce, 'wp_rest' )
			&& current_user_can( 'unfiltered_html' )
			&& current_user_can( 'edit_post', (int) $request['id'] );
	}

	/**
	 * `POST auvyx/v1/mcp/pending/{id}` {decision: approve|discard}.
	 *
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function decide( \WP_REST_Request $request ) {
		$post    = get_post( (int) $request['id'] );
		$pending = $post instanceof \WP_Post ? self::get( $post->ID ) : null;
		if ( null === $pending ) {
			return new \WP_Error( 'auvyx_mcp_no_pending', __( 'Nothing waits for approval on this page.', 'auvyx-builder' ), array( 'status' => 404 ) );
		}
		if ( 'discard' === $request['decision'] ) {
			delete_post_meta( $post->ID, self::META );
			return rest_ensure_response(
				array(
					'id'        => $post->ID,
					'discarded' => true,
				)
			);
		}
		$args = array(
			'content'  => (string) $pending['content'],
			'status'   => (string) $pending['status'],
			'where'    => (string) $pending['where'],
			'approved' => true,
			'via'      => sprintf( 'mcp:%1$s (approved by %2$s)', (string) $pending['token'], wp_get_current_user()->display_name ),
		);
		if ( null !== $pending['title'] ) {
			$args['title'] = (string) $pending['title'];
		}
		if ( null !== $pending['template'] ) {
			$args['template'] = (string) $pending['template'];
		}
		$saved = Writes::save( $post, $args );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		delete_post_meta( $post->ID, self::META );
		$saved['approved'] = true;
		return rest_ensure_response( $saved );
	}
}
